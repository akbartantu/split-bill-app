/**
 * Schema Manager
 * 
 * Manages spreadsheet schema: creates sheets, ensures headers, validates schema.
 * Never deletes existing sheets or columns - only adds missing ones.
 */

import { GoogleSheetsClient } from '../clients/GoogleSheetsClient';
import { SCHEMA, getSheetNames, getColumnNames, getRequiredColumnNames } from './schemaDefinition';

export interface SchemaHealthReport {
  isValid: boolean;
  sheets: SheetHealth[];
  warnings: string[];
  errors: string[];
}

export interface SheetHealth {
  name: string;
  exists: boolean;
  columns: ColumnHealth[];
  hasAllRequiredColumns: boolean;
  hasExtraColumns: boolean;
  extraColumns: string[];
  missingColumns: string[];
}

export interface ColumnHealth {
  name: string;
  exists: boolean;
  required: boolean;
  position?: number;
}

export class SchemaManager {
  constructor(
    private client: GoogleSheetsClient,
    private spreadsheetId: string
  ) {}

  /**
   * Ensure all required sheets exist, create if missing
   */
  async ensureSheetsExist(): Promise<void> {
    const requiredSheets = getSheetNames();
    const existingSheets = await this.client.getSheets();
    const existingSheetNames = existingSheets.map(s => s.title);

    for (const sheetName of requiredSheets) {
      if (!existingSheetNames.includes(sheetName)) {
        console.log(`Creating missing sheet: ${sheetName}`);
        await this.client.createSheet(sheetName);
      }
    }
  }

  /**
   * Ensure all required columns exist in each sheet
   * Never deletes or reorders existing columns - only appends missing ones
   */
  async ensureHeaders(): Promise<void> {
    const sheetNames = getSheetNames();

    for (const sheetName of sheetNames) {
      await this.ensureSheetHeaders(sheetName);
    }
  }

  /**
   * Ensure headers for a specific sheet
   */
  async ensureSheetHeaders(sheetName: string): Promise<void> {
    const sheetDef = SCHEMA[sheetName];
    if (!sheetDef) {
      throw new Error(`Sheet "${sheetName}" not found in schema`);
    }

    const requiredColumns = getColumnNames(sheetName);
    const existingHeaders = await this.client.getHeaders(sheetName);

    if (existingHeaders.length === 0) {
      // Sheet is empty, set all headers
      console.log(`Setting headers for sheet: ${sheetName}`);
      await this.client.setHeaders(sheetName, requiredColumns);
    } else {
      // Sheet has headers, append missing ones
      const missingColumns = requiredColumns.filter(col => !existingHeaders.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`Adding ${missingColumns.length} missing column(s) to sheet "${sheetName}": ${missingColumns.join(', ')}`);
        await this.client.appendHeaders(sheetName, requiredColumns);
      }
    }
  }

  /**
   * Add missing columns to a sheet without data loss
   */
  async addMissingColumns(sheetName: string): Promise<void> {
    await this.ensureSheetHeaders(sheetName);
  }

  /**
   * Validate entire schema and return health report
   */
  async validateSchema(): Promise<SchemaHealthReport> {
    const report: SchemaHealthReport = {
      isValid: true,
      sheets: [],
      warnings: [],
      errors: [],
    };

    const requiredSheets = getSheetNames();
    let existingSheets: { sheetId?: number; title: string }[] = [];

    try {
      existingSheets = await this.client.getSheets();
    } catch (error: any) {
      report.errors.push(`Failed to access spreadsheet: ${error.message}`);
      report.isValid = false;
      return report;
    }

    const existingSheetNames = existingSheets.map(s => s.title);

    // Check each required sheet
    for (const sheetName of requiredSheets) {
      const sheetHealth = await this.validateSheet(sheetName, existingSheetNames);
      report.sheets.push(sheetHealth);

      if (!sheetHealth.exists) {
        report.errors.push(`Required sheet "${sheetName}" is missing`);
        report.isValid = false;
      }

      if (!sheetHealth.hasAllRequiredColumns) {
        report.errors.push(`Sheet "${sheetName}" is missing required columns: ${sheetHealth.missingColumns.join(', ')}`);
        report.isValid = false;
      }

      if (sheetHealth.hasExtraColumns) {
        report.warnings.push(`Sheet "${sheetName}" has extra columns: ${sheetHealth.extraColumns.join(', ')}`);
      }
    }

    // Check for extra sheets (not in schema)
    const extraSheets = existingSheetNames.filter(name => !requiredSheets.includes(name));
    if (extraSheets.length > 0) {
      report.warnings.push(`Found extra sheets not in schema: ${extraSheets.join(', ')}`);
    }

    return report;
  }

  /**
   * Validate a specific sheet
   */
  private async validateSheet(sheetName: string, existingSheetNames: string[]): Promise<SheetHealth> {
    const sheetDef = SCHEMA[sheetName];
    if (!sheetDef) {
      throw new Error(`Sheet "${sheetName}" not found in schema`);
    }

    const exists = existingSheetNames.includes(sheetName);
    const requiredColumns = getColumnNames(sheetName);
    const requiredColumnNames = getRequiredColumnNames(sheetName);

    let existingHeaders: string[] = [];
    if (exists) {
      try {
        existingHeaders = await this.client.getHeaders(sheetName);
      } catch (error: any) {
        // Sheet exists but can't read headers - might be empty
        existingHeaders = [];
      }
    }

    const columnHealth: ColumnHealth[] = requiredColumns.map(colName => {
      const position = existingHeaders.indexOf(colName);
      const colDef = sheetDef.columns.find(c => c.name === colName);
      return {
        name: colName,
        exists: position >= 0,
        required: colDef?.required || false,
        position: position >= 0 ? position + 1 : undefined,
      };
    });

    const missingColumns = columnHealth
      .filter(col => !col.exists && col.required)
      .map(col => col.name);

    const extraColumns = existingHeaders.filter(h => !requiredColumns.includes(h));

    return {
      name: sheetName,
      exists,
      columns: columnHealth,
      hasAllRequiredColumns: missingColumns.length === 0,
      hasExtraColumns: extraColumns.length > 0,
      extraColumns,
      missingColumns,
    };
  }

  /**
   * Print formatted health report to console
   */
  printReport(report: SchemaHealthReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('SCHEMA HEALTH REPORT');
    console.log('='.repeat(60));

    if (report.isValid) {
      console.log('\n✅ Schema is valid!\n');
    } else {
      console.log('\n❌ Schema has errors!\n');
    }

    // Print sheet status
    console.log('Sheets Status:');
    for (const sheet of report.sheets) {
      const status = sheet.exists ? '✅' : '❌';
      const columnsStatus = sheet.hasAllRequiredColumns ? '✅' : '⚠️';
      console.log(`  ${status} ${sheet.name} (${sheet.columns.length} columns) ${columnsStatus}`);

      if (sheet.missingColumns.length > 0) {
        console.log(`    Missing: ${sheet.missingColumns.join(', ')}`);
      }
      if (sheet.extraColumns.length > 0) {
        console.log(`    Extra: ${sheet.extraColumns.join(', ')}`);
      }
    }

    // Print warnings
    if (report.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of report.warnings) {
        console.log(`  - ${warning}`);
      }
    }

    // Print errors
    if (report.errors.length > 0) {
      console.log('\n❌ Errors:');
      for (const error of report.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  /**
   * Setup complete schema (create sheets + headers)
   */
  async setupSchema(): Promise<void> {
    console.log('Setting up spreadsheet schema...\n');
    
    // Step 1: Ensure all sheets exist
    console.log('Step 1: Ensuring all sheets exist...');
    await this.ensureSheetsExist();
    console.log('✅ All sheets exist\n');

    // Step 2: Ensure all headers exist
    console.log('Step 2: Ensuring all headers exist...');
    await this.ensureHeaders();
    console.log('✅ All headers exist\n');

    // Step 3: Validate
    console.log('Step 3: Validating schema...');
    const report = await this.validateSchema();
    this.printReport(report);

    if (!report.isValid) {
      throw new Error('Schema validation failed. Please review errors above.');
    }

    console.log('✅ Schema setup complete!\n');
  }
}
