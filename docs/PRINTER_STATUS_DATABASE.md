# Printer Status Database Changes

## Overview
This document describes the database schema changes made to support the Paper Refill tracking feature in the Printer Status page.

## Migration
- **Migration file**: `portal/migrations/0020_alter_usedklcistransaction_options_and_more.py`
- **Applied**: February 15, 2026

## New Fields Added to `Printer` Model

### `tray_capacity`
- **Type**: `IntegerField`
- **Default**: `250`
- **Description**: Maximum number of sheets the printer tray can hold
- **Editable**: Yes - click on the capacity value in Paper Refill section to edit

### `tray_level`
- **Type**: `CharField(max_length=20)`
- **Default**: `'Full'`
- **Allowed Values**: 
  - `Full` - Tray is full or recently refilled
  - `Low` - Tray paper is running low
  - `Needs Refill` - Tray requires immediate refill
- **Description**: Current paper level status of the printer tray

### `last_refill_time`
- **Type**: `DateTimeField`
- **Nullable**: Yes (`null=True, blank=True`)
- **Description**: Timestamp of when the printer was last marked as refilled
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
- **Full schema** (relevant fields):

```sql
ALTER TABLE printers ADD COLUMN tray_capacity INTEGER DEFAULT 250;
ALTER TABLE printers ADD COLUMN tray_level VARCHAR(20) DEFAULT 'Full';
ALTER TABLE printers ADD COLUMN last_refill_time DATETIME NULL;
```

## Model Location
- **File**: `portal/models.py`
- **Class**: `Printer`
