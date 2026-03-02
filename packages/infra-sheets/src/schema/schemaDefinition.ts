/**
 * Spreadsheet Schema Definition
 * 
 * Single source of truth for all sheet (tab) names and column definitions.
 * All names use snake_case as per requirements.
 */

export interface ColumnDefinition {
  name: string; // snake_case column name
  type: 'string' | 'number' | 'boolean' | 'date' | 'timestamp' | 'json';
  required: boolean;
  defaultValue?: any;
  description: string;
}

export interface SheetDefinition {
  name: string; // snake_case sheet name
  columns: ColumnDefinition[];
  description: string;
}

/**
 * Complete schema definition for all sheets
 * Based on Master Plan entities: Group, Member, Billing, Receipt, LineItem, Allocation, Adjustment, Payment, Settlement, AuditLog, Lock, Idempotency
 */
export const SCHEMA: Record<string, SheetDefinition> = {
  groups: {
    name: 'groups',
    description: 'Groups of people who split bills together',
    columns: [
      { name: 'group_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'name', type: 'string', required: true, description: 'Group name' },
      { name: 'currency', type: 'string', required: true, defaultValue: 'USD', description: 'Currency code (ISO format)' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  members: {
    name: 'members',
    description: 'Members (people) in groups',
    columns: [
      { name: 'member_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'group_id', type: 'string', required: true, description: 'Foreign key to groups' },
      { name: 'name', type: 'string', required: true, description: 'Member name' },
      { name: 'email', type: 'string', required: false, description: 'Email address (optional)' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  billings: {
    name: 'billings',
    description: 'Bill-splitting events (one restaurant visit)',
    columns: [
      { name: 'billing_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'group_id', type: 'string', required: true, description: 'Foreign key to groups' },
      { name: 'name', type: 'string', required: true, description: 'Billing name (e.g., "Dinner at Restaurant")' },
      { name: 'date', type: 'date', required: true, description: 'Billing date' },
      { name: 'status', type: 'string', required: true, defaultValue: 'draft', description: 'Status: draft, confirmed, settled' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  receipts: {
    name: 'receipts',
    description: 'Physical receipts (a billing can have multiple)',
    columns: [
      { name: 'receipt_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'billing_id', type: 'string', required: true, description: 'Foreign key to billings' },
      { name: 'merchant_name', type: 'string', required: false, description: 'Merchant name (optional)' },
      { name: 'receipt_date', type: 'date', required: false, description: 'Receipt date (optional)' },
      { name: 'subtotal', type: 'number', required: false, description: 'Sum of line items' },
      { name: 'total', type: 'number', required: false, description: 'Total amount (subtotal + adjustments)' },
      { name: 'currency', type: 'string', required: false, description: 'Currency code' },
      { name: 'ocr_source', type: 'string', required: false, description: 'OCR source: tesseract, google-vision' },
      { name: 'raw_ocr_text', type: 'string', required: false, description: 'Raw OCR text (optional)' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  line_items: {
    name: 'line_items',
    description: 'Items on receipts',
    columns: [
      { name: 'line_item_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'receipt_id', type: 'string', required: true, description: 'Foreign key to receipts' },
      { name: 'item_name', type: 'string', required: true, description: 'Item name' },
      { name: 'quantity', type: 'number', required: true, description: 'Quantity' },
      { name: 'unit_price', type: 'number', required: true, description: 'Unit price' },
      { name: 'total_price', type: 'number', required: true, description: 'Calculated: quantity * unit_price' },
      { name: 'confidence_score', type: 'number', required: false, description: 'OCR confidence score (0-1)' },
      { name: 'needs_review', type: 'boolean', required: false, defaultValue: false, description: 'Needs manual review' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  allocations: {
    name: 'allocations',
    description: 'Assignment of line items to members (who pays for what)',
    columns: [
      { name: 'allocation_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'line_item_id', type: 'string', required: true, description: 'Foreign key to line_items' },
      { name: 'member_id', type: 'string', required: true, description: 'Foreign key to members' },
      { name: 'share_count', type: 'number', required: true, description: 'Share count (e.g., 2 of 4 slices)' },
      { name: 'share_amount', type: 'number', required: true, description: 'Calculated share amount' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  adjustments: {
    name: 'adjustments',
    description: 'Extra charges or discounts (tax, tip, service charge, discount)',
    columns: [
      { name: 'adjustment_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'billing_id', type: 'string', required: true, description: 'Foreign key to billings' },
      { name: 'type', type: 'string', required: true, description: 'Type: tax, service, tip, discount' },
      { name: 'name', type: 'string', required: true, description: 'Adjustment name (e.g., "Sales Tax")' },
      { name: 'mode', type: 'string', required: true, description: 'Mode: percentage, fixed' },
      { name: 'value', type: 'number', required: true, description: 'Value (percentage 0-100 or fixed amount)' },
      { name: 'is_inclusive', type: 'boolean', required: true, defaultValue: false, description: 'Already included in prices?' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  payments: {
    name: 'payments',
    description: 'Records of who paid how much',
    columns: [
      { name: 'payment_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'billing_id', type: 'string', required: true, description: 'Foreign key to billings' },
      { name: 'member_id', type: 'string', required: true, description: 'Foreign key to members' },
      { name: 'amount', type: 'number', required: true, description: 'Payment amount' },
      { name: 'method', type: 'string', required: false, description: 'Payment method (e.g., cash, card, venmo)' },
      { name: 'status', type: 'string', required: false, defaultValue: 'completed', description: 'Status: pending, completed, refunded' },
      { name: 'reference_note', type: 'string', required: false, description: 'Reference note (optional)' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  settlements: {
    name: 'settlements',
    description: 'Calculated settlements (who should pay whom)',
    columns: [
      { name: 'settlement_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'billing_id', type: 'string', required: true, description: 'Foreign key to billings (unique)' },
      { name: 'transfers_json', type: 'json', required: true, description: 'Array of transfers (JSON string)' },
      { name: 'calculated_at', type: 'timestamp', required: true, description: 'Calculation timestamp' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
      { name: 'version', type: 'number', required: true, defaultValue: 1, description: 'Version for optimistic locking' },
    ],
  },
  audit_logs: {
    name: 'audit_logs',
    description: 'Audit trail of all actions',
    columns: [
      { name: 'log_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'user_id', type: 'string', required: false, description: 'User who performed action (optional)' },
      { name: 'action', type: 'string', required: true, description: 'Action type (e.g., CREATE_BILLING)' },
      { name: 'resource_type', type: 'string', required: true, description: 'Resource type (e.g., billing)' },
      { name: 'resource_id', type: 'string', required: true, description: 'Resource ID' },
      { name: 'details_json', type: 'json', required: false, description: 'Additional details (JSON string)' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Timestamp' },
    ],
  },
  locks: {
    name: 'locks',
    description: 'Locks for critical operations (optimistic locking)',
    columns: [
      { name: 'lock_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'resource_type', type: 'string', required: true, description: 'Resource type (e.g., billing)' },
      { name: 'resource_id', type: 'string', required: true, description: 'Resource ID' },
      { name: 'locked_by', type: 'string', required: false, description: 'User/process that locked (optional)' },
      { name: 'expires_at', type: 'timestamp', required: true, description: 'Lock expiration' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Lock timestamp' },
    ],
  },
  idempotency_keys: {
    name: 'idempotency_keys',
    description: 'Idempotency key tracking (prevent duplicate operations)',
    columns: [
      { name: 'key_id', type: 'string', required: true, description: 'Primary key (UUID)' },
      { name: 'idempotency_key', type: 'string', required: true, description: 'Idempotency key (unique)' },
      { name: 'entity_type', type: 'string', required: true, description: 'Entity type' },
      { name: 'entity_id', type: 'string', required: true, description: 'Entity ID' },
      { name: 'result_json', type: 'json', required: true, description: 'Cached result (JSON string)' },
      { name: 'created_at', type: 'timestamp', required: true, description: 'Creation timestamp' },
      { name: 'expires_at', type: 'timestamp', required: true, description: 'Expiration timestamp' },
    ],
  },
  app_config: {
    name: 'app_config',
    description: 'Application configuration (optional)',
    columns: [
      { name: 'config_key', type: 'string', required: true, description: 'Primary key (config key name)' },
      { name: 'config_value', type: 'string', required: true, description: 'Config value' },
      { name: 'description', type: 'string', required: false, description: 'Description (optional)' },
      { name: 'updated_at', type: 'timestamp', required: true, description: 'Last update timestamp' },
    ],
  },
};

/**
 * Get all sheet names in order
 */
export function getSheetNames(): string[] {
  return Object.keys(SCHEMA);
}

/**
 * Get column names for a sheet
 */
export function getColumnNames(sheetName: string): string[] {
  const sheet = SCHEMA[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in schema`);
  }
  return sheet.columns.map(col => col.name);
}

/**
 * Get required column names for a sheet
 */
export function getRequiredColumnNames(sheetName: string): string[] {
  const sheet = SCHEMA[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in schema`);
  }
  return sheet.columns.filter(col => col.required).map(col => col.name);
}
