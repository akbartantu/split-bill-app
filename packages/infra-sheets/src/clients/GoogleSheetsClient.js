/**
 * Google Sheets Client
 *
 * Handles authentication and basic operations with Google Sheets API.
 * Never logs secrets.
 */
import { google } from 'googleapis';
export class GoogleSheetsClient {
    constructor(spreadsheetId, serviceAccountEmail, privateKey) {
        this.spreadsheetId = spreadsheetId;
        // Handle private key with line breaks
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        // Create JWT auth
        this.auth = new google.auth.JWT({
            email: serviceAccountEmail,
            key: formattedKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    }
    /**
     * Get all sheets in the spreadsheet
     */
    async getSheets() {
        try {
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
            });
            return (response.data.sheets || []).map(sheet => ({
                sheetId: sheet.properties?.sheetId,
                title: sheet.properties?.title || '',
            }));
        }
        catch (error) {
            if (error.code === 404) {
                throw new Error(`Spreadsheet not found. Check SPREADSHEET_ID: ${this.spreadsheetId}`);
            }
            if (error.code === 403) {
                throw new Error(`Permission denied. Share spreadsheet with service account email.`);
            }
            throw new Error(`Failed to get sheets: ${error.message}`);
        }
    }
    /**
     * Check if a sheet exists
     */
    async sheetExists(sheetName) {
        const sheets = await this.getSheets();
        return sheets.some(s => s.title === sheetName);
    }
    /**
     * Create a new sheet
     */
    async createSheet(sheetName) {
        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: sheetName,
                                },
                            },
                        },
                    ],
                },
            });
        }
        catch (error) {
            if (error.message?.includes('already exists')) {
                // Sheet already exists, that's okay
                return;
            }
            throw new Error(`Failed to create sheet "${sheetName}": ${error.message}`);
        }
    }
    /**
     * Get headers (first row) of a sheet
     */
    async getHeaders(sheetName) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!1:1`,
            });
            const values = response.data.values;
            if (!values || values.length === 0) {
                return [];
            }
            return (values[0] || []).map((val) => String(val || '').trim()).filter((val) => val.length > 0);
        }
        catch (error) {
            if (error.code === 400 && error.message?.includes('Unable to parse range')) {
                // Sheet might be empty, return empty array
                return [];
            }
            throw new Error(`Failed to get headers for sheet "${sheetName}": ${error.message}`);
        }
    }
    /**
     * Set headers (first row) of a sheet
     * Only sets if sheet is empty (no headers exist)
     */
    async setHeaders(sheetName, headers) {
        try {
            const existingHeaders = await this.getHeaders(sheetName);
            if (existingHeaders.length > 0) {
                // Headers already exist, don't overwrite
                return;
            }
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!1:1`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [headers],
                },
            });
        }
        catch (error) {
            throw new Error(`Failed to set headers for sheet "${sheetName}": ${error.message}`);
        }
    }
    /**
     * Append headers to existing sheet (add missing columns at the end)
     */
    async appendHeaders(sheetName, newHeaders) {
        try {
            const existingHeaders = await this.getHeaders(sheetName);
            const missingHeaders = newHeaders.filter(h => !existingHeaders.includes(h));
            if (missingHeaders.length === 0) {
                return; // All headers already exist
            }
            // Get the last column index
            const lastColIndex = existingHeaders.length;
            const range = `${sheetName}!${this.columnIndexToLetter(lastColIndex + 1)}1:${this.columnIndexToLetter(lastColIndex + missingHeaders.length)}1`;
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [missingHeaders],
                },
            });
        }
        catch (error) {
            throw new Error(`Failed to append headers for sheet "${sheetName}": ${error.message}`);
        }
    }
    /**
     * Read all rows from a sheet (excluding header)
     */
    async readRows(sheetName) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A:Z`, // Adjust range as needed
            });
            const values = response.data.values || [];
            if (values.length <= 1) {
                return []; // No data rows (only header or empty)
            }
            return values.slice(1); // Skip header row
        }
        catch (error) {
            throw new Error(`Failed to read rows from sheet "${sheetName}": ${error.message}`);
        }
    }
    /**
     * Append a row to a sheet
     */
    async appendRow(sheetName, row) {
        try {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [row],
                },
            });
        }
        catch (error) {
            throw new Error(`Failed to append row to sheet "${sheetName}": ${error.message}`);
        }
    }
    /**
     * Update a row in a sheet
     */
    async updateRow(sheetName, rowIndex, row) {
        try {
            // rowIndex is 1-based (1 = header, 2 = first data row)
            const range = `${sheetName}!${rowIndex}:${rowIndex}`;
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [row],
                },
            });
        }
        catch (error) {
            throw new Error(`Failed to update row ${rowIndex} in sheet "${sheetName}": ${error.message}`);
        }
    }
    /**
     * Convert column index (0-based) to letter (A, B, ..., Z, AA, AB, ...)
     */
    columnIndexToLetter(index) {
        let result = '';
        while (index > 0) {
            index--;
            result = String.fromCharCode(65 + (index % 26)) + result;
            index = Math.floor(index / 26);
        }
        return result;
    }
}
