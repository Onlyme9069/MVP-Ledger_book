import { TransactionRecord } from '../types';
import { safeParseJsonResponse } from '../utils/apiUtils';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (error: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export const DEFAULT_SPREADSHEET_ID = '1qfw3v0D-INDw42Z5PvNbFQ5lVRr-prmsxlolyZos-u0';
export const DEFAULT_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${DEFAULT_SPREADSHEET_ID}/edit`;
const OAUTH_CLIENT_ID = '80188949029-ghh82qikqknpcf92gmin9kg7146ca2lv.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

interface SyncResult {
  success: boolean;
  spreadsheetId: string;
  updatedRows?: number;
  updatedCells?: number;
  syncedAt: string;
  error?: string;
}

class GoogleSheetsService {

  public getTargetSpreadsheetId(): string {
    return localStorage.getItem('mvp_sheets_id') || DEFAULT_SPREADSHEET_ID;
  }

  public setTargetSpreadsheetId(id: string): void {
    localStorage.setItem('mvp_sheets_id', id.trim());
  }

  public getTargetSpreadsheetUrl(): string {
    const id = this.getTargetSpreadsheetId();
    return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  }

  public clearCachedToken(): void {
    sessionStorage.removeItem('google_sheets_token');
    sessionStorage.removeItem('google_sheets_token_expiry');
  }

  public getCachedAccessToken(): string | null {
    const token = sessionStorage.getItem('google_sheets_token');
    const expiry = sessionStorage.getItem('google_sheets_token_expiry');
    if (token && expiry && Date.now() < parseInt(expiry, 10)) {
      return token;
    }
    return null;
  }

  public setCachedAccessToken(token: string, expiresInSeconds: number = 3500): void {
    const expiryTime = Date.now() + expiresInSeconds * 1000;
    sessionStorage.setItem('google_sheets_token', token);
    sessionStorage.setItem('google_sheets_token_expiry', expiryTime.toString());
  }

  public requestAccessToken(forcePrompt: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!forcePrompt) {
        const cached = this.getCachedAccessToken();
        if (cached) {
          return resolve(cached);
        }
      }

      if (!window.google?.accounts?.oauth2) {
        return reject(new Error('Google Identity Services script not loaded yet. Please wait a moment and try again.'));
      }

      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: OAUTH_CLIENT_ID,
          scope: SCOPES,
          callback: (response: { access_token?: string; error?: string }) => {
            if (response.error || !response.access_token) {
              console.warn('OAuth authorization response:', response);
              return reject(new Error(response.error || 'Authorization was not granted.'));
            }
            this.setCachedAccessToken(response.access_token);
            resolve(response.access_token);
          },
          error_callback: (err: any) => {
            console.warn('Google Identity Services notice:', err);
            const errStr = typeof err === 'string' ? err : JSON.stringify(err || {});
            if (
              err?.type === 'popup_closed' || 
              errStr.includes('closed') || 
              err?.message?.includes('closed')
            ) {
              return reject(new Error('Sign-in popup was closed before completing authorization. Click "Sync Now" to try again.'));
            }
            if (err?.type === 'popup_failed_to_open') {
              return reject(new Error('Popup was blocked by your browser. Please allow popups for this site and try again.'));
            }
            reject(new Error(err?.message || 'Google Sheets authorization was cancelled or failed.'));
          }
        });

        client.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
      } catch (err: any) {
        console.warn('Failed to init Google OAuth token client', err);
        reject(err);
      }
    });
  }

  public async syncRecords(records: TransactionRecord[], existingToken?: string, forceFreshToken: boolean = false): Promise<SyncResult> {
    try {
      if (forceFreshToken) {
        this.clearCachedToken();
      }
      const token = (existingToken && !forceFreshToken) ? existingToken : await this.requestAccessToken(forceFreshToken);
      const spreadsheetId = this.getTargetSpreadsheetId();

      const response = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: token,
          spreadsheetId,
          records,
        }),
      });

      const data = await safeParseJsonResponse(response);

      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          this.clearCachedToken();
        }
        throw new Error(data.error || data.rawGoogleError || 'Sync failed');
      }

      localStorage.setItem('mvp_sheets_last_synced', data.syncedAt);
      localStorage.setItem('mvp_sheets_last_count', (records.length).toString());

      return data as SyncResult;
    } catch (err: any) {
      console.warn('googleSheetsService.syncRecords status:', err?.message || err);
      throw err;
    }
  }

  public disconnectSheet(): void {
    localStorage.removeItem('mvp_sheets_id');
  }

  public async createAndSyncNewSheet(records: TransactionRecord[], forceFreshToken: boolean = false): Promise<SyncResult> {
    try {
      if (forceFreshToken) {
        this.clearCachedToken();
      }
      const token = await this.requestAccessToken(forceFreshToken);

      const response = await fetch('/api/sheets/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: token,
          records,
        }),
      });

      const data = await safeParseJsonResponse(response);

      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          this.clearCachedToken();
        }
        throw new Error(data.error || 'Failed to create new Google Sheet');
      }

      this.setTargetSpreadsheetId(data.spreadsheetId);
      localStorage.setItem('mvp_sheets_last_synced', data.syncedAt);
      localStorage.setItem('mvp_sheets_last_count', (records.length).toString());

      return data as SyncResult;
    } catch (err: any) {
      console.error('googleSheetsService.createAndSyncNewSheet failure:', err);
      throw err;
    }
  }

  public isAutoSyncEnabled(): boolean {
    return localStorage.getItem('mvp_sheets_autosync') === 'true';
  }

  public setAutoSyncEnabled(enabled: boolean): void {
    localStorage.setItem('mvp_sheets_autosync', enabled ? 'true' : 'false');
  }

  public getLastSyncedTime(): string | null {
    return localStorage.getItem('mvp_sheets_last_synced');
  }

  public getLastSyncedRecordCount(): number {
    const val = localStorage.getItem('mvp_sheets_last_count');
    return val ? parseInt(val, 10) : 0;
  }
}

export const googleSheetsService = new GoogleSheetsService();
