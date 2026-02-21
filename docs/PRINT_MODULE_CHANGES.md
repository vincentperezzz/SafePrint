# Print Module Changes

## Overview
This document describes the database schema and view logic changes made to support printing features including Paper Refill tracking and document routing fixes.

---

## Document Routing Fix (February 21, 2026)

### Problem
Documents uploaded without a printer assigned were appearing in the "Print Completed" tab under "Unassigned Jobs" instead of the "Print Queue" tab.

### Solution
Modified the view queries to properly route documents based on status and printer assignment.

### Changes to `portal/views.py`

#### `printing_queue()` View
**Before:**
```python
documents = Document.objects.filter(
    doc_status__in=['Pending', 'Queued', 'Printing', 'Finished']
)
```

**After:**
```python
documents = Document.objects.filter(
    doc_status__in=['Pending', 'Queued', 'Printing']
)
```

- Removed `'Finished'` from the status filter
- Queue now only shows documents that are actively being processed

#### `print_completed()` View
**Before:**
```python
completed_documents = Document.objects.filter(doc_status='Finished')
```

**After:**
```python
completed_documents = Document.objects.filter(
    doc_status='Finished',
    printed_at__isnull=False
)
```

- Added `printed_at__isnull=False` filter
- Ensures only documents that were actually printed appear in Completed
- Documents without a `printed_at` timestamp stay in the queue

### Document Status Flow
| Status | Printer Assigned | Location |
|--------|-----------------|----------|
| Pending | No | Print Queue |
| Pending | Yes | Print Queue |
| Queued | Yes | Print Queue |
| Printing | Yes | Print Queue |
| Finished | Yes (printed_at set) | Print Completed |
| Finished | No (printed_at null) | Should not occur* |
| Cancelled | Any | Neither (excluded) |
| Picked Up | Any | Neither (excluded) |

*Documents should not reach Finished status without being printed.

---

## Printer Defaults Fix (February 21, 2026)

### Problem
Newly added printers had incorrect defaults and dropdown selections weren't saving.

### Database Schema Changes

```sql
ALTER TABLE printers MODIFY printer_status varchar(50) NOT NULL DEFAULT 'Offline';
ALTER TABLE printers MODIFY paper_assigned varchar(50) NULL DEFAULT NULL;
ALTER TABLE printers MODIFY paper_quality varchar(50) NULL DEFAULT NULL;
ALTER TABLE printers MODIFY tray_capacity int NULL DEFAULT NULL;
ALTER TABLE printers MODIFY tray_level varchar(20) NOT NULL DEFAULT 'Needs Refill';
```

### Field Defaults Summary
| Field | Old Default | New Default |
|-------|-------------|-------------|
| `printer_status` | (none) | `'Offline'` |
| `paper_assigned` | Required | `NULL` |
| `paper_quality` | Required | `NULL` |
| `tray_capacity` | `250` | `NULL` |
| `tray_level` | `'Full'` | `'Needs Refill'` |

### Related Code Fixes
- Added `@csrf_exempt` to `update_printer_field()` view
- Added "None" option to PAPER_SIZE_CHOICES and GSM_CHOICES
- Fixed dropdown URL: `/portal/api/update_printer_field/`
- Page auto-reloads after dropdown change

---

## Paper Refill Tracking (February 15, 2026)

## New Fields Added to `Printer` Model

### `tray_capacity`
- **Type**: `IntegerField`
- **Default**: `NULL` (was 250, changed Feb 21)
- **Nullable**: Yes
- **Description**: Maximum number of sheets the printer tray can hold
- **Display**: Shows "Not set" when null
- **Editable**: Yes - click on the capacity value in Paper Refill section to edit

### `tray_level`
- **Type**: `CharField(max_length=20)`
- **Default**: `'Needs Refill'` (was 'Full', changed Feb 21)
- **Allowed Values**: 
  - `Full` - Tray is full or recently refilled (green dot)
  - `Low` - Tray paper is running low (yellow dot)
  - `Needs Refill` - Tray requires immediate refill (red dot)
- **Description**: Current paper level status of the printer tray

### `last_refill_time`
- **Type**: `DateTimeField`
- **Nullable**: Yes (`null=True, blank=True`)
- **Description**: Timestamp of when the printer was last marked as refilled
- **Display**: Shows "Never" when null
- **Updated by**: "Mark as Refilled" button in Paper Refill section

## API Endpoints

### Update Printer Field
- **URL**: `/portal/api/update_printer_field/`
- **Method**: POST
- **Parameters**:
  - `printer_id` - ID of the printer
  - `field` - Field name to update (e.g., `tray_capacity`)
  - `value` - New value
- **Used for**: Updating tray capacity when user edits the value

### Mark Printer Refilled
- **URL**: `/portal/api/mark_printer_refilled/`
- **Method**: POST
- **Parameters**:
  - `printer_id` - ID of the printer
- **Actions**:
  1. Sets `tray_level` to `'Full'`
  2. Sets `last_refill_time` to current timestamp
- **Response**: 
  ```json
  {
    "success": true,
    "tray_level": "Full",
    "last_refill_time": "2026-02-15T10:30:00+00:00"
  }
  ```

## UI Features

### Tray Capacity Editing
1. Click on the capacity value (e.g., "250 sheets")
2. Input field appears for editing
3. Press Enter to save or Escape to cancel
4. Value updates in database immediately

### Mark as Refilled
1. Click "Mark as Refilled" button
2. Tray level updates to "Full" with green indicator
3. Last Refill Time updates to "Just now"
4. Time display auto-updates every minute (e.g., "2 minutes ago", "1 hour ago")

## Database Table
- **Table name**: `printers`
- **Current schema** (relevant fields):

```sql
-- Current column definitions (as of Feb 21, 2026)
printer_status  varchar(50)  NOT NULL DEFAULT 'Offline'
paper_assigned  varchar(50)  NULL DEFAULT NULL
paper_quality   varchar(50)  NULL DEFAULT NULL
tray_capacity   int          NULL DEFAULT NULL
tray_level      varchar(20)  NOT NULL DEFAULT 'Needs Refill'
last_refill_time datetime(6) NULL
```

## Model Location
- **File**: `portal/models.py`
- **Class**: `Printer`
