import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Sparkles,
  Zap,
  Table,
  Plus,
  Trash2
} from 'lucide-react';
import { motion } from 'motion/react';
import { TransactionRecord } from '../types';
import { googleSheetsService } from '../services/googleSheetsService';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: TransactionRecord[];
}

export default function GoogleSheetsSyncModal({ isOpen, onClose, records }: GoogleSheetsSyncModalProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [autoSync, setAutoSync] = useState<boolean>(googleSheetsService.isAutoSyncEnabled());
  const [sheetId, setSheetId] = useState<string>(googleSheetsService.getTargetSpreadsheetId());
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(googleSheetsService.getLastSyncedTime());

  if (!isOpen) return null;

  const sheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '#';

  const handleSyncNow = async (forceReauth: boolean = false) => {
    if (!sheetId) {
      return handleCreateNewSheet();
    }

    setIsSyncing(true);
    setSyncStatus('idle');
    setStatusMessage('');

    try {
      const activeRecords = records.filter(r => r.status !== 'deleted');
      const result = await googleSheetsService.syncRecords(activeRecords, undefined, forceReauth);
      
      setSyncStatus('success');
      setLastSyncTime(result.syncedAt);
      setStatusMessage(`Successfully synced ${activeRecords.length} records (${result.updatedRows} rows) to Google Sheets!`);
    } catch (err: any) {
      console.warn('Manual sheet sync status:', err?.message || err);
      setSyncStatus('error');
      setStatusMessage(err.message || 'Failed to sync with Google Sheets.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateNewSheet = async () => {
    setIsSyncing(true);
    setSyncStatus('idle');
    setStatusMessage('');

    try {
      const activeRecords = records.filter(r => r.status !== 'deleted');
      const result = await googleSheetsService.createAndSyncNewSheet(activeRecords);
      
      setSheetId(result.spreadsheetId);
      setSyncStatus('success');
      setLastSyncTime(result.syncedAt);
      setStatusMessage(`Created a brand-new Google Sheet in your account and synced ${activeRecords.length} records!`);
    } catch (err: any) {
      console.error('Create new sheet failed', err);
      setSyncStatus('error');
      setStatusMessage(err.message || 'Failed to create new Google Sheet.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnectSheet = () => {
    googleSheetsService.disconnectSheet();
    setSheetId('');
    setSyncStatus('idle');
    setStatusMessage('Old sheet disconnected. Click "Create New Google Sheet" or paste a Sheet ID below.');
  };

  const handleAutoSyncToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setAutoSync(enabled);
    googleSheetsService.setAutoSyncEnabled(enabled);
  };

  const handleSheetIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value;
    setSheetId(newId);
    googleSheetsService.setTargetSpreadsheetId(newId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] shadow-2xl border border-slate-200 relative flex flex-col my-auto overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl shrink-0">
              <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                Google Sheets Ledger Sync
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600" />
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500">Live bidirectional synchronization for transaction records</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content Container */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 min-h-0">
          {/* Action to create new sheet or management */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-xl p-3 sm:p-3.5 flex items-center justify-between gap-2.5">
            <div>
              <span className="text-xs font-bold text-emerald-950 block">Need a fresh Google Sheet?</span>
              <span className="text-[11px] text-emerald-700/90 block">Create a dedicated sheet in your own Google Drive</span>
            </div>
            <button
              onClick={handleCreateNewSheet}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white font-bold text-xs rounded-lg shadow transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Sheet</span>
            </button>
          </div>

          {/* Target Spreadsheet Link Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Table className="h-3.5 w-3.5 text-emerald-600" />
                Connected Google Sheet
              </span>
              {sheetId ? (
                <div className="flex items-center gap-2">
                  <a 
                    href={sheetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <span>Open Sheet</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={handleDisconnectSheet}
                    title="Remove / Unlink this sheet"
                    className="text-xs text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="text-[10px]">Unlink</span>
                  </button>
                </div>
              ) : (
                <span className="text-xs text-amber-600 font-semibold">No Sheet Connected</span>
              )}
            </div>

            <div className="text-[11px] text-slate-600 break-all font-mono bg-white p-2 rounded border border-slate-200 max-h-20 overflow-y-auto">
              {sheetId ? sheetUrl : 'No Google Sheet currently linked.'}
            </div>

            {/* Sheet ID customizer */}
            <div className="pt-1">
              <label className="text-[11px] text-slate-500 block mb-1">Spreadsheet ID:</label>
              <input 
                type="text"
                value={sheetId}
                onChange={handleSheetIdChange}
                placeholder="Paste Google Sheet ID or click Create New Sheet"
                className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
              <span className="text-[11px] text-slate-500 font-medium block">Active Ledger Records</span>
              <span className="text-base sm:text-lg font-extrabold text-emerald-900">
                {records.filter(r => r.status !== 'deleted').length} Items
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <span className="text-[11px] text-slate-500 font-medium block">Last Synced</span>
              <span className="text-xs font-bold text-slate-800 block truncate mt-1">
                {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Not synced yet'}
              </span>
            </div>
          </div>

          {/* Sync Status Feedback */}
          {syncStatus === 'success' && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </motion.div>
          )}

          {syncStatus === 'error' && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{statusMessage}</span>
              </div>
              <div className="pt-1 flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={handleCreateNewSheet}
                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  <span>Create New Sheet</span>
                </button>
                <button
                  onClick={() => handleSyncNow(true)}
                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                >
                  Re-authorize
                </button>
              </div>
            </motion.div>
          )}

          {/* Options */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                <span className="text-xs font-bold text-slate-800 block">Automatic Record Sync</span>
                <span className="text-[10px] text-slate-500 block">Sync automatically whenever new transactions are created</span>
              </div>
            </div>
            <input 
              type="checkbox"
              checked={autoSync}
              onChange={handleAutoSyncToggle}
              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded cursor-pointer shrink-0 ml-2"
            />
          </div>
        </div>

        {/* Fixed Action Footer */}
        <div className="flex items-center justify-end gap-2 p-3 sm:p-4 border-t border-slate-100 shrink-0 bg-slate-50/80">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
          
          <button 
            onClick={() => handleSyncNow()}
            disabled={isSyncing}
            className="px-4 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now with Google Sheets'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
