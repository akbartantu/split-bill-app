/**
 * Google Sheets Client
 *
 * Handles authentication and basic operations with Google Sheets API.
 * Never logs secrets.
 */

import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';

export interface SheetInfo {
  sheetId?: number;
  title: string;
}

export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets;
  private auth: any;

  constructor(
    private spreadsheetId: string,
    serviceAccountEmail: string,
    privateKey: string
  ) {
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    this.auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: formattedKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  async getSheets(): Promise<SheetInfo[]> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      return (response.data.sheets || []).map(sheet => ({
        sheetId: sheet.properties?.sheetId,
        title: sheet.properties?.title || '',
      }));
    } catch (error: any) {
      if (error.code === 404) {
        throw new Error(`Spreadsheet not found. Check SPREADSHEET_ID: ${this.spreadsheetId}`);
      }
      if (error.code === 403) {
        throw new Error(`Permission denied. Share spreadsheet with service account email.`);
      }
      throw new Error(`Failed to get sheets: ${error.message}`);
    }
  }

  async sheetExists(sheetName: string): Promise<boolean> {
    const sheets = await this.getSheets();
    return sheets.some(s => s.title === sheetName);
  }

  async createSheet(sheetName: string): Promise<void> {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
    } catch (error: any) {
      if (error.message?.includes('already exists')) return;
      throw new Error(`Failed to create sheet "${sheetName}": ${error.message}`);
    }
  }

  async getHeaders(sheetName: string): Promise<string[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!1:1`,
      });
      const values = response.data.values;
      if (!values || values.length === 0) return [];
      return (values[0] || []).map((val: any) => String(val || '').trim()).filter((val: string) => val.length > 0);
    } catch (error: any) {
      if (error.code === 400 && error.message?.includes('Unable to parse range')) return [];
      throw new Error(`Failed to get headers for sheet "${sheetName}": ${error.message}`);
    }
  }

  async setHeaders(sheetName: string, headers: string[]): Promise<void> {
    try {
      const existingHeaders = await this.getHeaders(sheetName);
      if (existingHeaders.length > 0) return;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!1:1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    } catch (error: any) {
      throw new Error(`Failed to set headers for sheet "${sheetName}": ${error.message}`);
    }
  }

  async appendHeaders(sheetName: string, newHeaders: string[]): Promise<void> {
    try {
      const existingHeaders = await this.getHeaders(sheetName);
      const missingHeaders = newHeaders.filter(h => !existingHeaders.includes(h));
      if (missingHeaders.length === 0) return;
      const lastColIndex = existingHeaders.length;
      const range = `${sheetName}!${this.columnIndexToLetter(lastColIndex + 1)}1:${this.columnIndexToLetter(lastColIndex + missingHeaders.length)}1`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [missingHeaders] },
      });
    } catch (error: any) {
      throw new Error(`Failed to append headers for sheet "${sheetName}": ${error.message}`);
    }
  }

  async readRows(sheetName: string): Promise<any[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
      });
      const values = response.data.values || [];
      return values.length <= 1 ? [] : values.slice(1);
    } catch (error: any) {
      throw new Error(`Failed to read rows from sheet "${sheetName}": ${error.message}`);
    }
  }

  async appendRow(sheetName: string, row: any[]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    } catch (error: any) {
      throw new Error(`Failed to append row to sheet "${sheetName}": ${error.message}`);
    }
  }

  async updateRow(sheetName: string, rowIndex: number, row: any[]): Promise<void> {
    try {
      const range = `${sheetName}!${rowIndex}:${rowIndex}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    } catch (error: any) {
      throw new Error(`Failed to update row ${rowIndex} in sheet "${sheetName}": ${error.message}`);
    }
  }

  private columnIndexToLetter(index: number): string {
    let result = '';
    while (index > 0) {
      index--;
      result = String.fromCharCode(65 + (index % 26)) + result;
      index = Math.floor(index / 26);
    }
    return result;
  }
}
