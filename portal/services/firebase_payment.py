import os
import logging
import re
import threading
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account


_firebase_lock = threading.Lock()
logger = logging.getLogger(__name__)
FIRESTORE_TIMEOUT_SECONDS = 5
FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore'
_firestore_session = None
_firestore_project_id = None


class FirebasePaymentError(Exception):
    pass


def _get_firestore_session():
    global _firestore_session, _firestore_project_id

    with _firebase_lock:
        if _firestore_session and _firestore_project_id:
            return _firestore_session, _firestore_project_id

        service_account_path = settings.FIREBASE_SERVICE_ACCOUNT_PATH
        if not service_account_path or not os.path.exists(service_account_path):
            raise FileNotFoundError('Firebase service account file is missing or not configured.')

        credentials = service_account.Credentials.from_service_account_file(
            service_account_path,
            scopes=[FIRESTORE_SCOPE],
        )
        if not credentials.project_id:
            raise FirebasePaymentError('Firebase project id is missing from the service account file.')

        _firestore_session = AuthorizedSession(credentials)
        _firestore_project_id = credentials.project_id
        return _firestore_session, _firestore_project_id


def _firestore_base_url(project_id):
    return f'https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents'


def build_notification_reference(notification_id):
    _, project_id = _get_firestore_session()
    notification_key = str(notification_id or '').strip()
    if not notification_key:
        raise FirebasePaymentError('Firestore notification id is required.')
    return f'projects/{project_id}/databases/(default)/documents/{settings.FIREBASE_GCASH_COLLECTION}/{notification_key}'


def _firestore_document_id(document_name):
    return document_name.rsplit('/', 1)[-1]


def _firestore_value_to_python(value):
    if 'stringValue' in value:
        return value['stringValue']
    if 'integerValue' in value:
        return int(value['integerValue'])
    if 'doubleValue' in value:
        return float(value['doubleValue'])
    if 'booleanValue' in value:
        return bool(value['booleanValue'])
    if 'timestampValue' in value:
        return value['timestampValue']
    if 'nullValue' in value:
        return None
    if 'arrayValue' in value:
        return [_firestore_value_to_python(item) for item in value['arrayValue'].get('values', [])]
    if 'mapValue' in value:
        return {
            key: _firestore_value_to_python(item)
            for key, item in value['mapValue'].get('fields', {}).items()
        }
    return None


def _python_to_firestore_value(value):
    if value is None:
        return {'nullValue': None}
    if isinstance(value, bool):
        return {'booleanValue': value}
    if isinstance(value, Decimal):
        return {'doubleValue': float(value)}
    if isinstance(value, int):
        return {'integerValue': str(value)}
    if isinstance(value, float):
        return {'doubleValue': value}
    if hasattr(value, 'isoformat'):
        return {'timestampValue': value.isoformat().replace('+00:00', 'Z')}
    return {'stringValue': str(value)}


def _parse_firestore_document(document):
    fields = document.get('fields', {})
    payload = {
        key: _firestore_value_to_python(value)
        for key, value in fields.items()
    }
    return {
        'doc_id': _firestore_document_id(document['name']),
        'reference': document['name'],
        'payload': payload,
        'update_time': document.get('updateTime'),
    }


def get_notification(*, notification_ref=None, notification_id=None):
    if not notification_ref:
        notification_ref = build_notification_reference(notification_id)

    try:
        response = _firestore_request('GET', f'https://firestore.googleapis.com/v1/{notification_ref}')
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return _parse_firestore_document(response.json())
    except (ValueError, KeyError, requests.RequestException) as exc:
        logger.warning('Firestore notification fetch failed: %s', exc)
        raise FirebasePaymentError('Firestore notification fetch failed.') from exc
    return {
        'doc_id': _firestore_document_id(document['name']),
        'reference': document['name'],
        'payload': payload,
        'update_time': document.get('updateTime'),
    }


def _firestore_request(method, url, **kwargs):
    try:
        session, _ = _get_firestore_session()
        response = session.request(method, url, timeout=FIRESTORE_TIMEOUT_SECONDS, **kwargs)
        return response
    except requests.RequestException as exc:
        logger.warning('Firestore request failed: %s', exc)
        raise FirebasePaymentError('Firestore request failed.') from exc


def normalize_phone_number(phone_number):
    digits = ''.join(ch for ch in (phone_number or '') if ch.isdigit())
    if digits.startswith('63') and len(digits) == 12:
        return f'0{digits[2:]}'
    if digits.startswith('9') and len(digits) == 10:
        return f'0{digits}'
    return digits


def parse_amount(value):
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value)).quantize(Decimal('0.01'))

    cleaned = re.sub(r'[^0-9.]', '', str(value))
    if not cleaned:
        return None

    try:
        return Decimal(cleaned).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


def _coerce_timestamp(value):
    if value is None:
        return None
    if hasattr(value, 'to_pydatetime'):
        value = value.to_pydatetime()
    elif isinstance(value, str):
        value = parse_datetime(value)
        if value is None:
            return None
    if timezone.is_naive(value):
        return timezone.make_aware(value, timezone.get_current_timezone())
    return value


def list_matching_notifications(*, payer_number, expected_amount, earliest_at, latest_at, limit=None):
    normalized_number = normalize_phone_number(payer_number)
    if not normalized_number:
        return []

    try:
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
    except (ValueError, KeyError, requests.RequestException) as exc:
        logger.warning('Firestore notification lookup failed: %s', exc)
        raise FirebasePaymentError('Firestore notification lookup failed.') from exc

    matches = []
    try:
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
    except (ValueError, KeyError, TypeError) as exc:
        logger.warning('Firestore notification stream failed: %s', exc)
        raise FirebasePaymentError('Firestore notification stream failed.') from exc

    matches.sort(key=lambda item: item['captured_at'])
    if limit and limit > 0:
        return matches[:limit]
    return matches


def claim_notification(*, notification_ref, customer_id, intent_id):
    try:
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

        patched_document = _parse_firestore_document(patch_response.json())
        patched_payload = patched_document['payload']
        if patched_payload.get('claimed_by_cid') != customer_id:
            raise FirebasePaymentError('Firestore notification claim did not persist customer ownership.')
        if str(patched_payload.get('claimed_by_intent_id') or '') != str(intent_id):
            raise FirebasePaymentError('Firestore notification claim did not persist intent ownership.')
        if not patched_payload.get('claimed_at'):
            raise FirebasePaymentError('Firestore notification claim did not persist the claim timestamp.')

        return payload
    except (ValueError, KeyError, requests.RequestException) as exc:
        logger.warning('Firestore notification claim failed: %s', exc)
        raise FirebasePaymentError('Firestore notification claim failed.') from exc