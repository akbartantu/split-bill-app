# @billsplit-pro/infra-sheets

Spreadsheet infrastructure package for BillSplit Pro.

## Purpose

This package provides:
- Google Sheets client for read/write operations
- Schema management (create sheets, ensure headers, validate schema)
- Safe migration support (never deletes data)

## Installation

```bash
npm install
```

## Dependencies

- `googleapis` - Google APIs client library
- `dotenv` - Environment variable management

## Usage

### Schema Setup

```typescript
import { GoogleSheetsClient } from '@billsplit-pro/infra-sheets';
import { SchemaManager } from '@billsplit-pro/infra-sheets';

const client = new GoogleSheetsClient(
  process.env.SPREADSHEET_ID!,
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!
);

const schemaManager = new SchemaManager(client, process.env.SPREADSHEET_ID!);

// Setup complete schema
await schemaManager.setupSchema();
```

### Validate Schema

```typescript
const report = await schemaManager.validateSchema();
schemaManager.printReport(report);
```

### Read/Write Operations

```typescript
// Read headers
const headers = await client.getHeaders('groups');

// Read rows
const rows = await client.readRows('groups');

// Append row
await client.appendRow('groups', ['id', 'name', 'currency', ...]);

// Update row
await client.updateRow('groups', 2, ['id', 'name', 'currency', ...]);
```

## Environment Variables

Required:
- `SPREADSHEET_ID` - Google Spreadsheet ID
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - Service account private key

## Safety Rules

- Never deletes sheets
- Never deletes columns
- Never reorders existing columns
- Only appends missing columns
- Preserves all existing data

## Schema

See `docs/14-SHEETS-SCHEMA.md` for complete schema documentation.
