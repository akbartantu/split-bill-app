/**
 * Spreadsheet Infrastructure Package
 * 
 * Public exports for spreadsheet operations
 */

export { GoogleSheetsClient } from './clients/GoogleSheetsClient';
export { SchemaManager } from './schema/schemaManager';
export { SCHEMA, getSheetNames, getColumnNames, getRequiredColumnNames } from './schema/schemaDefinition';
export type { SheetHealth, ColumnHealth, SchemaHealthReport } from './schema/schemaManager';
