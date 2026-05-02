# GCash Listener Payment Gateway Plan

> **Last Updated:** May 2026  
> **Status:** Planning

---

## Overview

This document defines the migration plan for replacing the current KLCIS-based payment flow with a SafePrint-managed GCash validation flow backed by Firebase and the external notification listener app.

The goal is to:

- remove KLCIS from this branch
- remove the current minimum payment workaround of 5 pesos
- keep the existing SafePrint payment lifecycle shape where students initiate payment, verify payment, then get queued for printing
- use Firebase listener data as the primary payment validation source
- prevent one real payment from validating multiple CIDs
- keep receipt upload as a fallback path only when automatic validation is ambiguous or missing

---

## Current State

The current payment flow in SafePrint works like this:

1. Student uploads documents and is redirected to the payment page.
2. The frontend sends an initiate request to Django.
3. Django creates a KLCIS voucher and opens the KLCIS or Xendit checkout URL.
4. The frontend polls Django for verification.
5. Django checks KLCIS transaction data.
6. When payment is confirmed, related Payment rows are marked paid and documents are queued.

The current implementation also includes two KLCIS-specific behaviors:

- a 5 peso minimum charge workaround
- voucher credit generation for excess payment caused by that minimum charge

These KLCIS-specific behaviors should not remain in the new GCash listener flow unless voucher credits are intentionally kept as a separate product feature.

---

## Target State

The new flow should be:

1. Student reaches the payment page with a CID and selected documents.
2. Student enters the payer GCash number.
3. SafePrint creates a local payment intent for that CID.
4. SafePrint shows the recipient number, QR code, exact amount, and payment instructions.
5. The student pays manually in GCash.
6. The notification listener app saves the received-money event in Firestore.
7. SafePrint verifies payment by matching the pending payment intent against an unclaimed Firestore notification.
8. SafePrint claims the notification for that CID, marks the payment as paid, and queues the documents.

The server remains the source of truth for whether a CID is paid. Firestore becomes the payment evidence source.

---

## Recommended Architecture

### 1. Keep Existing SafePrint Page Flow

Do not redesign the whole payment lifecycle.

Keep the current shape:

- initiate payment
- show instructions
- verify manually or by polling
- queue documents after success
- cancel pending payment if the student abandons the flow

This keeps the frontend and backend mental model close to the current implementation while replacing only the payment transport and verification source.

### 2. Introduce a Local Payment Intent Record

Do not rely on per-document Payment rows alone.

Add a separate local payment intent entity that represents one payment attempt for one CID. A payment intent should store at least:

- customer_id
- document ids snapshot
- expected_amount
- payer_number
- recipient number snapshot
- status: pending, matched, expired, cancelled, failed
- created_at
- expires_at
- matched_firestore_doc_id
- matched_at
- verification_source

This record is the anchor that lets one CID claim at most one external payment notification.

### 3. Use Firestore Notifications as Claimable Payment Evidence

The listener app currently stores notification data similar to:

- amount
- capturedAt
- number
- rawText

This is enough for an initial implementation, but the ideal Firestore document should also include:

- amount_value as a machine-friendly numeric value
- payer_number_normalized in one consistent format
- captured_at_ts as a Firestore Timestamp
- claim fields such as claimed_by_cid, claimed_at, claimed_by_intent_id
- an internal deduplication key if the listener app can provide one

If updating the listener app is possible, these fields should be added early.

---

## Matching Strategy

The primary validation rule should be:

An unpaid SafePrint payment intent may be marked paid only if there is exactly one valid unclaimed Firestore notification that matches the intent.

### Minimum Match Conditions

A notification should qualify only when all of the following are true:

- payer number matches the normalized number entered by the student
- amount matches the exact expected amount
- notification was captured after the payment intent was created
- notification is still unclaimed
- notification is within the allowed time window for the intent

### Recommended Time Window

Use a bounded payment window such as:

- start: payment intent creation time
- end: creation time plus 10 to 15 minutes

This prevents old notifications from being reused for a later CID.

---

## Duplicate and Race-Condition Handling

This is the critical part of the design.

### Problem Case

The same student might create two transactions with:

- the same payer number
- the same amount
- only a small time gap between them

If matching is based only on number and amount, one payment could be reused incorrectly.

### Required Rule

Each Firestore notification must be claimable once only.

When verification succeeds, the Django server must atomically write claim metadata to the Firestore document, such as:

- claimed_by_cid
- claimed_by_intent_id
- claimed_at

The browser must never be allowed to claim notifications directly.

### Claim Ordering

If multiple open SafePrint intents exist for the same payer number and same amount, the server should prioritize the oldest valid pending intent first.

That means:

- first intent claims first valid unclaimed notification
- second intent can only succeed if a second unclaimed notification exists
- if only one payment actually happened, only one CID becomes paid

This is the rule that prevents a second print flow from stealing the first payment.

---

## Receipt Policy

Receipt upload should not be mandatory for every payment.

### Recommended Policy

- primary path: Firebase auto-match only
- fallback path: ask for receipt or manual review only when auto-match fails or is ambiguous

### When to Trigger Fallback

Fallback should be used when:

- no matching notification appears within the allowed window
- more than one candidate notification matches the same intent
- the listener app data is incomplete or delayed
- an admin needs proof for dispute or refund review

This keeps the normal payment flow fast while preserving a recovery path.

---

## Firestore vs Local Storage

It is not necessary to copy all Firestore notifications into the local SafePrint database.

### Recommended Split

- Firestore stores notification evidence and claim metadata
- SafePrint stores payment intents and final payment state

### Local Database Should Store

- the pending intent
- the final matched Firestore document id
- verification timestamps
- queued or paid status for audit

### Firestore Should Store

- raw notification data
- normalized matching fields
- claim markers showing which CID consumed the notification

This avoids unnecessary duplication while preserving auditability.

---

## UI Flow Plan

The payment page should be updated to a SafePrint-owned instruction flow.

### Proposed Student Experience

1. Student enters the payer GCash number.
2. Student clicks proceed.
3. SafePrint shows:
   - exact amount to send
   - recipient GCash number
   - recipient QR code
   - copy number button
   - open GCash guidance text for mobile users
4. Student completes payment externally.
5. Student clicks I Have Paid or waits for auto-check.
6. SafePrint verifies the payment using Firestore.

### Important Constraint

Because there is no official direct GCash API in this setup, SafePrint should not assume it can open the GCash app reliably. The UI should guide the user to pay manually via QR or recipient number.

---

## KLCIS Removal Scope

The migration should remove or replace the following categories of logic:

- KLCIS voucher creation
- KLCIS checkout URL generation
- KLCIS polling and transaction matching
- 5 peso minimum bump logic
- KLCIS-only voucher cleanup logic
- documentation and admin references that are no longer true after the migration

The per-document Payment model and the document queueing behavior should remain conceptually intact.

---

## Implementation Phases

### Phase 1. Data Design

- define the payment intent model
- define Firestore claim fields
- decide exact expiry window and normalization rules

### Phase 2. Backend Flow Replacement

- replace KLCIS initiate logic with payment intent creation
- replace KLCIS verify logic with Firestore matching and claiming
- preserve current success path that marks Payment rows paid and queues documents

### Phase 3. Payment Page Replacement

- remove KLCIS redirect behavior
- render recipient number and QR instructions
- update step 2 copy to reflect SafePrint-managed verification

### Phase 4. Cleanup

- remove KLCIS-specific configuration and services
- remove minimum-charge messaging
- update docs and admin text

### Phase 5. Safety Validation

- test same number and same amount across two different CIDs
- test one real payment against two pending CIDs
- test delayed notification arrival
- test no-notification timeout path
- test ambiguous match fallback

---

## Open Decisions

The following decisions still need confirmation before implementation:

1. Whether voucher credit logic should be removed entirely or preserved as a separate feature.
2. Whether claim metadata should be written directly onto the Firestore notification document or stored in a separate claim collection.
3. Exact timeout window for pending payment intents.
4. Whether receipt upload should be available directly on the payment page or only after automatic validation fails.
5. Whether the listener app will be updated to store machine-friendly numeric and timestamp fields.

---

## Recommended Direction

For this branch, the recommended implementation direction is:

- remove KLCIS completely from the payment transport and verification path
- add a local payment intent table in SafePrint
- use Firestore notification records as one-time claimable payment evidence
- claim notifications on the server only
- do not require receipt upload for every transaction
- use receipt upload only for ambiguous or failed auto-validation cases

This gives the system a realistic GCash flow without needing a direct GCash API while still preventing duplicate reuse of the same payment across multiple CIDs.