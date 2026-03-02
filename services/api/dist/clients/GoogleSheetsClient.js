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
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        this.auth = new google.auth.JWT({
            email: serviceAccountEmail,
            key: formattedKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    }
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
    async sheetExists(sheetName) {
        const sheets = await this.getSheets();
        return sheets.some(s => s.title === sheetName);
    }
    async createSheet(sheetName) {
        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: sheetName } } }],
                },
            });
        }
        catch (error) {
            if (error.message?.includes('already exists'))
                return;
            throw new Error(`Failed to create sheet "${sheetName}": ${error.message}`);
        }
    }
    async getHeaders(sheetName) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!1:1`,
            });
            const values = response.data.values;
            if (!values || values.length === 0)
                return [];
            return (values[0] || []).map((val) => String(val || '').trim()).filter((val) => val.length > 0);
        }
        catch (error) {
            if (error.code === 400 && error.message?.includes('Unable to parse range'))
                return [];
            throw new Error(`Failed to get headers for sheet "${sheetName}": ${error.message}`);
        }
    }
    async setHeaders(sheetName, headers) {
        try {
            const existingHeaders = await this.getHeaders(sheetName);
            if (existingHeaders.length > 0)
                return;
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!1:1`,
                valueInputOption: 'RAW',
                requestBody: { values: [headers] },
            });
        }
        catch (error) {
            throw new Error(`Failed to set headers for sheet "${sheetName}": ${error.message}`);
        }
    }
    async appendHeaders(sheetName, newHeaders) {
        try {
            const existingHeaders = await this.getHeaders(sheetName);
            const missingHeaders = newHeaders.filter(h => !existingHeaders.includes(h));
            if (missingHeaders.length === 0)
                return;
            const lastColIndex = existingHeaders.length;
            const range = `${sheetName}!${this.columnIndexToLetter(lastColIndex + 1)}1:${this.columnIndexToLetter(lastColIndex + missingHeaders.length)}1`;
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: { values: [missingHeaders] },
            });
        }
        catch (error) {
            throw new Error(`Failed to append headers for sheet "${sheetName}": ${error.message}`);
        }
    }
    async readRows(sheetName) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A:Z`,
            });
            const values = response.data.values || [];
            return values.length <= 1 ? [] : values.slice(1);
        }
        catch (error) {
            throw new Error(`Failed to read rows from sheet "${sheetName}": ${error.message}`);
        }
    }
    async appendRow(sheetName, row) {
        try {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'RAW',
                requestBody: { values: [row] },
            });
        }
        catch (error) {
            throw new Error(`Failed to append row to sheet "${sheetName}": ${error.message}`);
        }
    }
    async updateRow(sheetName, rowIndex, row) {
        try {
            const range = `${sheetName}!${rowIndex}:${rowIndex}`;
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: { values: [row] },
            });
        }
        catch (error) {
            throw new Error(`Failed to update row ${rowIndex} in sheet "${sheetName}": ${error.message}`);
        }
    }
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
