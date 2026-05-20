# Relevant Source Code for SafePrint GCash Capture and Firebase Payment Flow

This document collects the minimum source code needed to explain the end-to-end GCash payment pipeline used by SafePrint.

The complete flow is:

1. An Android phone listens for incoming GCash payment notifications.
2. The phone app parses the amount and sender number.
3. The app uploads parsed notifications to Firebase Firestore.
4. The Django server creates a local payment intent for a specific customer and document set.
5. The Django server queries Firestore, matches a notification by payer number and amount within a time window, then claims that notification so it cannot be reused.
6. After a successful match, SafePrint marks the payment as paid and queues the documents for printing.

External mobile-capture repository used in this flow:

- https://github.com/crystalineddd/safeprint-notif-capture/tree/latest-build

## 1. Android App: Notification Listener Registration

This manifest code is what allows the Android app to run a foreground notification-listener service and keep listening after reboot.

Source: external repository, `android/app/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

    <application
        android:label="SafePrint"
        android:name="${applicationName}"
        android:icon="@mipmap/ic_launcher">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>

        <service
            android:name=".NotificationCaptureService"
            android:exported="true"
            android:foregroundServiceType="dataSync"
            android:label="GCash Notification Capture"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>

        <receiver
            android:name=".StartupReceiver"
            android:enabled="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.LOCKED_BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.USER_UNLOCKED" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
```

## 2. Android-Flutter Bridge

This code exposes native Android features to the Flutter UI. It opens notification settings, checks permissions, loads locally saved captures, enables or pauses capture, and forces sync to Firebase.

Source: external repository, `android/app/src/main/kotlin/com/safeprint/app/MainActivity.kt`

```kotlin
class MainActivity : FlutterActivity() {
    private val methodChannelName = "gcash_capture/methods"
    private val eventChannelName = "gcash_capture/events"
    private val postNotificationsRequestCode = 2001
    private var pendingNotificationPermissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, methodChannelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "openNotificationAccessSettings" -> {
                        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                        startActivity(intent)
                        result.success(true)
                    }
                    "isNotificationAccessGranted" -> {
                        result.success(hasNotificationListenerAccess())
                    }
                    "isAppNotificationPermissionGranted" -> {
                        result.success(hasAppNotificationPermission())
                    }
                    "requestAppNotificationPermission" -> {
                        requestAppNotificationPermission(result)
                    }
                    "loadSavedNotifications" -> {
                        result.success(NotificationCaptureService.loadSavedNotifications(this))
                    }
                    "isCaptureEnabled" -> {
                        result.success(NotificationCaptureService.isCaptureEnabled(this))
                    }
                    "setCaptureEnabled" -> {
                        val enabled = call.argument<Boolean>("enabled") ?: true
                        if (enabled) {
                            NotificationCaptureService.requestListenerResume(this)
                        } else {
                            NotificationCaptureService.setCaptureEnabled(this, false)
                            startService(Intent(this, NotificationCaptureService::class.java).apply {
                                action = "com.safeprint.app.action.STOP_CAPTURE"
                            })
                        }
                        result.success(true)
                    }
                    "syncSavedNotificationsToFirebase" -> {
                        NotificationCaptureService.syncSavedNotificationsToFirebase(this)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, eventChannelName)
            .setStreamHandler(NotificationEventStreamHandler)
    }
}
```

## 3. Android App: Capturing and Parsing GCash Notifications

This is the core native service. It filters notifications to GCash payment receipts, extracts the amount and mobile number, stores the payload locally, uploads parsed entries to Firestore, and publishes events to Flutter.

Source: external repository, `android/app/src/main/kotlin/com/safeprint/app/NotificationCaptureService.kt`

```kotlin
class NotificationCaptureService : NotificationListenerService() {
    companion object {
        private const val prefsName = "gcash_notifications"
        private const val captureEnabledKey = "capture_enabled"
        private const val notificationKeyPrefix = "capture_"
        private const val paymentReceiptMarker = "you have received money in gcash!"

        fun syncSavedNotificationsToFirebase(context: Context) {
            cleanupUnparsedNotificationsInFirebase(context.applicationContext)
            loadSavedNotifications(context).forEach { payload ->
                uploadNotificationToFirebase(context.applicationContext, payload)
            }
        }

        private fun uploadNotificationToFirebase(context: Context, payload: Map<String, Any>) {
            val packageName = payload["packageName"]?.toString().orEmpty()
            val rawText = payload["rawText"]?.toString().orEmpty()
            val title = payload["title"]?.toString().orEmpty()
            if (!isValidPaymentReceiptNotification(packageName, title, rawText)) {
                return
            }

            val documentId = payload["documentId"]?.toString().orEmpty()
            if (documentId.isBlank()) {
                return
            }

            val isParsed = payload["isParsed"] as? Boolean ?: false
            if (!isParsed) {
                deleteNotificationFromFirebase(context, documentId)
                return
            }

            try {
                FirebaseApp.initializeApp(context)
            } catch (_: Exception) {
            }

            val firestorePayload = payload.toMutableMap<String, Any>()
            firestorePayload["capturedAt"] = FieldValue.serverTimestamp()

            FirebaseFirestore.getInstance()
                .collection("gcash_notifications")
                .document(documentId)
                .set(firestorePayload)
        }

        private fun isValidPaymentReceiptNotification(
            packageName: String,
            title: String,
            rawText: String
        ): Boolean {
            if (!isGcashPackageName(packageName)) {
                return false
            }
            return containsPaymentReceiptMarker(rawText) || containsPaymentReceiptMarker(title)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!isCaptureEnabled(this)) {
            return
        }

        val packageName = sbn.packageName ?: return
        val extras = sbn.notification.extras
        val title = extras?.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras?.getCharSequence("android.text")?.toString().orEmpty()
        val bigText = extras?.getCharSequence("android.bigText")?.toString().orEmpty()
        val subText = extras?.getCharSequence("android.subText")?.toString().orEmpty()
        val tickerText = sbn.notification.tickerText?.toString().orEmpty()

        val mergedText = listOf(title, bigText, text, subText, tickerText)
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinctBy { it.lowercase() }
            .joinToString(" | ")
            .trim()

        val rawText = mergedText
        if (rawText.isBlank()) {
            return
        }
        if (!isValidPaymentReceiptNotification(packageName, title, rawText)) {
            return
        }

        val parseResult = parseGcashText(rawText)
        if (parseResult.entries.isEmpty()) {
            val payload = mapOf(
                "documentId" to buildDocumentId(packageName, sbn.postTime, 0, rawText),
                "packageName" to packageName,
                "title" to title,
                "rawText" to rawText,
                "amount" to "",
                "number" to "",
                "isParsed" to false,
                "isGcashSource" to true,
                "timestampEpochMs" to sbn.postTime,
                "parseCategory" to parseResult.category,
                "parseHint" to parseResult.hint
            )
            persistAndPublish(payload)
            return
        }

        parseResult.entries.forEachIndexed { index, parsed ->
            val payload = mapOf(
                "documentId" to buildDocumentId(packageName, sbn.postTime, index, rawText),
                "packageName" to packageName,
                "title" to title,
                "rawText" to rawText,
                "amount" to parsed.amount,
                "number" to parsed.number,
                "isParsed" to true,
                "isGcashSource" to true,
                "timestampEpochMs" to sbn.postTime + index,
                "parseCategory" to parseResult.category,
                "parseHint" to parseResult.hint
            )
            persistAndPublish(payload)
        }
    }

    private fun persistAndPublish(payload: Map<String, Any>) {
        saveNotificationLocally(payload)
        uploadNotificationToFirebase(applicationContext, payload)
        NotificationEventStreamHandler.publish(payload)
    }

    private fun parseGcashText(rawText: String): ParseResult {
        val normalized = rawText.replace("\n", " ").trim()
        val entries = mutableListOf<ParsedNotification>()

        val directPattern = Regex(
            pattern = """you\s+received\s+(.+?)\s+from\s+(.+?)\s+([+0-9][0-9*\-\s]{5,})""",
            option = RegexOption.IGNORE_CASE
        )

        directPattern.findAll(normalized).forEach { match ->
            val amount = match.groupValues[1].trim()
            val number = normalizeNumber(match.groupValues[3])
            if (amount.isNotBlank() && number.isNotBlank()) {
                entries.add(ParsedNotification(amount = amount, number = number))
            }
        }

        if (entries.isNotEmpty()) {
            return ParseResult(
                entries = entries,
                category = "payment",
                hint = "Parsed as a GCash payment receipt."
            )
        }

        val amountPattern = Regex(
            pattern = """(?:PHP|Php|php|P|₱)\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?""",
            option = RegexOption.IGNORE_CASE
        )
        val numberPattern = Regex(pattern = """(?:\+63|09)[0-9\-\s*]{8,}""")

        val amounts = amountPattern.findAll(normalized).map { it.value.trim() }.toList()
        val numbers = numberPattern.findAll(normalized).map { normalizeNumber(it.value) }.toList()

        if (amounts.isEmpty() || numbers.isEmpty()) {
            return ParseResult(
                entries = emptyList(),
                category = classifyUnparsedNotification(normalized, amounts.isNotEmpty(), numbers.isNotEmpty()),
                hint = buildParseHint(normalized, amounts.isNotEmpty(), numbers.isNotEmpty())
            )
        }

        val pairCount = minOf(amounts.size, numbers.size)
        for (index in 0 until pairCount) {
            val amount = amounts[index]
            val number = numbers[index]
            if (amount.isNotBlank() && number.isNotBlank()) {
                entries.add(ParsedNotification(amount = amount, number = number))
            }
        }

        return ParseResult(
            entries = entries,
            category = "payment",
            hint = "Parsed as a GCash payment receipt."
        )
    }
}
```

## 4. Flutter App: Firebase Initialization and Viewing Captured Records

The Flutter layer initializes Firebase and displays the latest Firestore records from the `gcash_notifications` collection.

Source: external repository, `lib/main.dart`

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  runApp(const MyApp());
}

class FirebaseCaptureRepository {
  FirebaseCaptureRepository._();

  static final FirebaseFirestore _db = FirebaseFirestore.instance;

  static Stream<List<NotificationCaptureRecord>> stream() {
    return _db
        .collection('gcash_notifications')
        .orderBy('capturedAt', descending: true)
        .limit(100)
        .snapshots()
        .map((snapshot) {
          final records = snapshot.docs
              .map(
                (doc) => NotificationCaptureRecord.fromMap(
                  doc.data(),
                  documentId: doc.id,
                  isUploadedToFirebase: true,
                ),
              )
              .toList();
          records.sort(
            (left, right) => right.timestamp.compareTo(left.timestamp),
          );
          return records;
        });
  }
}

class NotificationBridge {
  NotificationBridge._();

  static const MethodChannel _methodChannel = MethodChannel('gcash_capture/methods');

  static Future<List<NotificationCaptureRecord>> loadSavedNotifications() async {
    try {
      final saved = await _methodChannel.invokeMethod<List>('loadSavedNotifications');
      if (saved != null) {
        return (saved).map((item) {
          final map = Map<String, dynamic>.from(item as Map);
          return NotificationCaptureRecord.fromMap(map);
        }).toList();
      }
    } catch (_) {
    }
    return [];
  }

  static Future<void> syncSavedNotificationsToFirebase() {
    return _methodChannel.invokeMethod('syncSavedNotificationsToFirebase');
  }
}
```

## 5. Django Configuration for Firestore Access

The SafePrint server reads a Firebase service-account file and uses the same Firestore collection name that the Android app writes to.

Source: `SafePrint/settings.py`

```python
_firebase_service_account_candidates = [
    BASE_DIR / FIREBASE_SERVICE_ACCOUNT_FILENAME,
    BASE_DIR / 'venv' / FIREBASE_SERVICE_ACCOUNT_FILENAME,
]
FIREBASE_SERVICE_ACCOUNT_PATH = config(
    'FIREBASE_SERVICE_ACCOUNT_PATH',
    default=str(next((path for path in _firebase_service_account_candidates if path.exists()), _firebase_service_account_candidates[0]))
)
FIREBASE_GCASH_COLLECTION = config('FIREBASE_GCASH_COLLECTION', default='gcash_notifications')
```

## 6. Django Model for Local Payment Intent Tracking

This model is the server-side anchor for one payment attempt. It records the customer, the related document IDs, the payer number, the expected amount, the matched Firestore notification, and the payment state.

Source: `portal/models.py`

```python
class PaymentIntent(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_MATCHED = 'matched'
    STATUS_CANCELLED = 'cancelled'
    STATUS_EXPIRED = 'expired'
    STATUS_FAILED = 'failed'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_MATCHED, 'Matched'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_FAILED, 'Failed'),
    ]

    intent_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    customer_id = models.CharField(max_length=255, db_index=True)
    doc_ids = models.JSONField(default=list, blank=True)
    payer_number = models.CharField(max_length=20, db_index=True)
    expected_amount = models.DecimalField(max_digits=10, decimal_places=2)
    voucher_credit_code = models.CharField(max_length=20, blank=True, default='')
    credit_applied = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    recipient_name = models.CharField(max_length=255, blank=True, default='')
    recipient_number = models.CharField(max_length=20, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    verification_source = models.CharField(max_length=50, blank=True, default='')
    matched_notification_id = models.CharField(max_length=255, blank=True, default='', db_index=True)
    matched_raw_text = models.TextField(blank=True, default='')
    matched_at = models.DateTimeField(null=True, blank=True)
    evidence_redacted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

## 7. Django Firestore Matching and Claim Logic

This code is what makes the Firebase upload useful to the server. It normalizes phone numbers, queries Firestore by sender number, filters matches by amount and time window, and atomically claims a notification so one real payment cannot be reused by another transaction.

Source: `portal/services/firebase_payment.py`

```python
def normalize_phone_number(phone_number):
    digits = ''.join(ch for ch in (phone_number or '') if ch.isdigit())
    if digits.startswith('63') and len(digits) == 12:
        return f'0{digits[2:]}'
    if digits.startswith('9') and len(digits) == 10:
        return f'0{digits}'
    return digits


def list_matching_notifications(*, payer_number, expected_amount, earliest_at, latest_at, limit=None):
    normalized_number = normalize_phone_number(payer_number)
    if not normalized_number:
        return []

    _, project_id = _get_firestore_session()
    url = f'{_firestore_base_url(project_id)}:runQuery'
    response = _firestore_request(
        'POST',
        url,
        json={
            'structuredQuery': {
                'from': [{'collectionId': settings.FIREBASE_GCASH_COLLECTION}],
                'where': {
                    'fieldFilter': {
                        'field': {'fieldPath': 'number'},
                        'op': 'EQUAL',
                        'value': {'stringValue': normalized_number},
                    }
                },
            }
        },
    )
    response.raise_for_status()
    rows = response.json()

    matches = []
    for row in rows:
        document = row.get('document')
        if not document:
            continue

        parsed_document = _parse_firestore_document(document)
        payload = parsed_document['payload']
        captured_at = _coerce_timestamp(payload.get('capturedAt'))
        if captured_at is None:
            continue
        if captured_at < earliest_at or captured_at > latest_at:
            continue
        if payload.get('claimed_by_cid'):
            continue

        amount_value = parse_amount(payload.get('amount'))
        if amount_value != expected_amount:
            continue

        matches.append({
            'doc_id': parsed_document['doc_id'],
            'reference': parsed_document['reference'],
            'captured_at': captured_at,
            'payload': payload,
        })

    matches.sort(key=lambda item: item['captured_at'])
    if limit and limit > 0:
        return matches[:limit]
    return matches


def claim_notification(*, notification_ref, customer_id, intent_id):
    parsed_document = get_notification(notification_ref=notification_ref)
    if parsed_document is None:
        return None

    payload = parsed_document['payload']
    existing_claimed_by_cid = str(payload.get('claimed_by_cid') or '').strip()
    existing_claimed_by_intent_id = str(payload.get('claimed_by_intent_id') or '').strip()
    existing_claimed_at = payload.get('claimed_at')
    expected_intent_id = str(intent_id)

    if (
        existing_claimed_by_cid == customer_id
        and existing_claimed_by_intent_id == expected_intent_id
        and existing_claimed_at
    ):
        return payload

    if existing_claimed_by_cid and existing_claimed_by_cid != customer_id:
        return None
    if existing_claimed_by_intent_id and existing_claimed_by_intent_id != expected_intent_id:
        return None

    query_string = urlencode([
        ('currentDocument.updateTime', parsed_document['update_time']),
        ('updateMask.fieldPaths', 'claimed_by_cid'),
        ('updateMask.fieldPaths', 'claimed_by_intent_id'),
        ('updateMask.fieldPaths', 'claimed_at'),
    ])
    patch_response = _firestore_request(
        'PATCH',
        f'https://firestore.googleapis.com/v1/{notification_ref}?{query_string}',
        json={
            'fields': {
                'claimed_by_cid': _python_to_firestore_value(customer_id),
                'claimed_by_intent_id': _python_to_firestore_value(str(intent_id)),
                'claimed_at': _python_to_firestore_value(timezone.now()),
            }
        },
    )
    if patch_response.status_code in (409, 412):
        return None
    patch_response.raise_for_status()
    return payload
```

## 8. Django Helper That Verifies and Finalizes a Pending Payment

This is the most important server-side routine. It handles expiry, prevents older pending intents from being skipped, looks for candidate Firestore notifications, claims a matching notification, and marks the customer documents as paid.

Source: `portal/views.py`

```python
def _attempt_match_pending_payment_intent(payment_intent):
    if not payment_intent:
        return {
            'matched': False,
            'status': 'missing',
            'error': 'No pending payment found for this customer.',
        }

    with transaction.atomic():
        locked_intent = PaymentIntent.objects.select_for_update().get(pk=payment_intent.pk)

        if locked_intent.status != PaymentIntent.STATUS_PENDING:
            return {
                'matched': locked_intent.status == PaymentIntent.STATUS_MATCHED,
                'status': locked_intent.status,
            }

        if locked_intent.is_expired:
            _refund_reserved_voucher(locked_intent)
            locked_intent.status = PaymentIntent.STATUS_EXPIRED
            locked_intent.save(update_fields=['status', 'updated_at'])
            _cancel_pending_payment_intent_check(locked_intent.intent_id)
            return {
                'matched': False,
                'status': 'expired',
                'error': 'This payment attempt expired. Please start a new payment attempt.',
            }

        older_pending_intent_exists = PaymentIntent.objects.filter(
            status=PaymentIntent.STATUS_PENDING,
            payer_number=locked_intent.payer_number,
            expected_amount=locked_intent.expected_amount,
            created_at__lt=locked_intent.created_at,
            expires_at__gte=timezone.now(),
        ).exclude(pk=locked_intent.pk).exists()

        if older_pending_intent_exists:
            return _build_pending_payment_retry_response(
                'A previous payment attempt with the same number and amount is still waiting for confirmation.'
            )

        payments = list(
            Payment.objects.select_related('doc').filter(
                doc__customer_id=locked_intent.customer_id,
                doc__doc_id__in=locked_intent.doc_ids,
                payment_status='Unpaid',
            )
        )

        candidates = list_matching_notifications(
            payer_number=locked_intent.payer_number,
            expected_amount=Decimal(locked_intent.expected_amount),
            earliest_at=locked_intent.created_at,
            latest_at=locked_intent.expires_at,
        )

        for candidate in candidates:
            claimed_payload = claim_notification(
                notification_ref=candidate['reference'],
                customer_id=locked_intent.customer_id,
                intent_id=locked_intent.intent_id,
            )
            if claimed_payload is None:
                continue

            locked_intent.status = PaymentIntent.STATUS_MATCHED
            locked_intent.matched_notification_id = candidate['doc_id']
            locked_intent.matched_raw_text = claimed_payload.get('rawText', '')
            locked_intent.matched_at = timezone.now()
            locked_intent.verification_source = 'firestore'
            locked_intent.save(update_fields=[
                'status',
                'matched_notification_id',
                'matched_raw_text',
                'matched_at',
                'verification_source',
                'updated_at',
            ])

            _mark_customer_documents_paid(
                payments,
                approved_by='GCash-Listener-Auto',
                payment_method='gcash_listener',
            )
            _cancel_pending_payment_intent_check(locked_intent.intent_id)
            return {
                'matched': True,
                'status': 'matched',
                'notification_id': candidate['doc_id'],
            }

    return _build_pending_payment_retry_response()
```

## 9. Django Payment Endpoint

This endpoint drives the SafePrint payment page. The `initiate` action creates the local payment intent and returns the GCash payment instructions. The `verify` action tries to match the pending payment intent against Firestore.

Source: `portal/views.py`

```python
def payment(request):
    """
    Handle the SafePrint-managed GCash payment flow backed by Firebase.
    """
    site = SiteSetting.load()
    gateway_context = _payment_gateway_context(site)

    if request.method == 'POST':
        data = json.loads(request.body)
        action = data.get('action', '')
        customer_id = data.get('customer_id', '').strip()
        documents_ids = data.get('doc_ids', [])

        if action == 'initiate':
            _expire_stale_payment_intents(customer_id=customer_id)
            phone_number = normalize_phone_number(data.get('phone_number', '').strip())

            total_price = Decimal('0.00')
            for doc_id in documents_ids:
                try:
                    payment_obj = Payment.objects.get(doc__doc_id=doc_id)
                    total_price += Decimal(payment_obj.price)
                except Payment.DoesNotExist:
                    pass

            expires_at = timezone.now() + timedelta(minutes=site.payment_expiry_minutes or 10)
            payment_intent = PaymentIntent.objects.create(
                customer_id=customer_id,
                doc_ids=list(documents_ids),
                payer_number=phone_number,
                expected_amount=total_price,
                recipient_name=gateway_context['recipient_name'],
                recipient_number=gateway_context['recipient_number'],
                expires_at=expires_at,
            )

            return JsonResponse({
                'success': True,
                'mode': 'payment',
                'payment_intent_id': str(payment_intent.intent_id),
                'amount': float(total_price),
                'recipient_name': gateway_context['recipient_name'],
                'recipient_number': gateway_context['recipient_number'],
                'recipient_qr_url': gateway_context['recipient_qr_url'],
                'payment_expiry_minutes': gateway_context['payment_expiry_minutes'],
                'expires_at': expires_at.isoformat(),
                'open_url': 'gcash://',
            })

        elif action == 'verify':
            payment_intent_id = str(data.get('payment_intent_id', '') or '').strip()
            payment_intent_qs = PaymentIntent.objects.filter(
                customer_id=customer_id,
                status=PaymentIntent.STATUS_PENDING,
            )
            if payment_intent_id:
                payment_intent_qs = payment_intent_qs.filter(intent_id=payment_intent_id)

            payment_intent = payment_intent_qs.order_by('-created_at').first()
            match_result = _attempt_match_pending_payment_intent(payment_intent)
            if match_result.get('matched'):
                return JsonResponse({
                    'success': True,
                    'message': 'Payment verified! Your documents are queued for printing.',
                    'redirect_url': f'/confirmation/{customer_id}/',
                })
```

## 10. Payment Page UI

This HTML is the student-facing step where SafePrint shows the recipient account, exact amount, QR code, and the fallback payment issue form.

Source: `templates/payment.html`

```html
<div id="payment-step-2" class="card-payment-details" style="display: none;">
    <h3>Send the Payment in GCash</h3>
    <p id="step2-instructions" class="payment-hint">
        Use the recipient details below, then return here once you have sent the payment.
    </p>
    <div class="payment-destination">
        <div class="payment-destination-copy">
            <span class="payment-destination-label">Recipient</span>
            <div id="payment-recipient-name" class="payment-recipient-name">{{ payment_config.recipient_name }}</div>
            <span class="payment-destination-label">GCash Number</span>
            <div class="payment-number-row">
                <strong id="payment-recipient-number">{{ payment_config.recipient_number }}</strong>
                <button type="button" class="card-redirect-btn payment-copy-btn payment-gcash-btn" onclick="copyPaymentNumber()">Copy Number</button>
            </div>
            <span class="payment-destination-label">Exact Amount</span>
            <div id="payment-send-amount" class="payment-send-amount">₱{{ total_price|floatformat:2 }}</div>
            <p id="payment-expiry-text" class="payment-fineprint">This payment attempt expires after {{ payment_config.payment_expiry_minutes }} minutes.</p>
            <p class="payment-fineprint">If auto-detection fails, keep your receipt so the payment can be checked manually.</p>
        </div>
        <div class="payment-qr-wrap">
            {% if payment_config.recipient_qr_url %}
            <img id="payment-recipient-qr" src="{{ payment_config.recipient_qr_url }}" alt="GCash QR Code" class="payment-recipient-qr">
            {% endif %}
        </div>
    </div>
    <div class="payment-step-actions">
        <button type="button" id="open-gcash-btn" class="card-redirect-btn payment-gcash-btn" onclick="openGCashApp()">
            Open GCash App
        </button>
    </div>
    <button type="button" id="payment-help-btn" class="card-cancel-btn" onclick="togglePaymentHelp()">
        Payment Issue?
    </button>
</div>
```

## 11. Frontend JavaScript for Initiate and Verify

This JavaScript sends the initiate request to Django, polls the verify endpoint, opens the GCash app, and exposes the manual fallback for payment issues.

Source: `static/js/scripts.js`

```javascript
window.initiatePayment = async function () {
    const phoneInput = document.getElementById('phone-number');
    const balanceDue = PAYMENT.totalPrice - appliedCreditAmount;

    if (balanceDue > 0) {
        const phone = phoneInput.value.replace(/\s/g, '').trim();
        const phoneRegex = /^(\+?63|0)(9\d{9})$/;
        if (!phoneRegex.test(phone)) {
            alert('Please enter a valid Philippine phone number (e.g., 09171234567).');
            phoneInput.focus();
            return;
        }
    }

    const payload = {
        action: 'initiate',
        customer_id: PAYMENT.customerId,
        doc_ids: PAYMENT.docIds,
        phone_number: balanceDue > 0 ? phoneInput.value.replace(/\s/g, '').trim() : '',
    };

    const response = await fetch('/payment/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.success) {
        showPaymentStep2();
        setPaymentInstructions(data);
        startAutoPolling();
    }
};


window.verifyPayment = async function () {
    const response = await fetch('/payment/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({
            action: 'verify',
            customer_id: PAYMENT.customerId,
            payment_intent_id: currentPaymentIntentId,
        }),
    });

    const data = await response.json();
    if (data.success) {
        stopAutoPolling();
        clearPaymentCache();
        sessionStorage.clear();
        window.location.href = data.redirect_url || '/confirmation/' + PAYMENT.customerId + '/';
    }
};


window.openGCashApp = function () {
    if (isAndroidDevice()) {
        try {
            openUrlViaAnchor(GCASH_ANDROID_INTENT_URL);
        } catch (error) {
            launchGcashDirect('intent://open/#Intent;scheme=gcash;package=' + GCASH_ANDROID_PACKAGE + ';action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end');
        }
        return;
    }

    window.copyPaymentNumber(false).then(function () {
        launchGcashWithFallback(paymentOpenUrl || GCASH_APP_URL);
    }).catch(function () {
        launchGcashWithFallback(paymentOpenUrl || GCASH_APP_URL);
    });
};
```

## 12. Why These Files Are the Most Relevant

If the manuscript only needs the core payment implementation, these are the primary files to cite:

- External mobile app manifest: Android listener registration and permissions.
- External `MainActivity.kt`: Flutter-native bridge.
- External `NotificationCaptureService.kt`: actual notification capture, parsing, and Firebase upload.
- External `lib/main.dart`: Firebase initialization and capture monitoring UI.
- `SafePrint/settings.py`: Firestore service-account and collection configuration.
- `portal/models.py`: payment-intent tracking model.
- `portal/services/firebase_payment.py`: Firestore query and one-time claim logic.
- `portal/views.py`: payment initiation and verification flow.
- `templates/payment.html`: payment instruction page.
- `static/js/scripts.js`: browser-side payment control flow.

## 13. Optional Supporting Reference

For architectural explanation, SafePrint also has an internal design document that explains the intended listener-based payment gateway:

- `docs/GCASH_LISTENER_PAYMENT_GATEWAY.md`
