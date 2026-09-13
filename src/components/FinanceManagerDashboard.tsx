import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  TrendingUp, 
  Search, 
  Plus, 
  Trash2, 
  Calendar, 
  ArrowDownLeft, 
  ArrowUpRight,
  User,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import GlassIcon from './GlassIcon';
import { User as UserType, TransactionRecord, ActiveTab } from '../types';
import { dbService } from '../services/dbService';
import RecordForm from './RecordForm';
import AnalyticsView from './AnalyticsView';
import ProfileView from './ProfileView';
import NoticesPanel from './NoticesPanel';
import DisputeModal from './DisputeModal';
import RecordDetailsModal from './RecordDetailsModal';
import ChatWidget from './ChatWidget';
import GoogleSheetsSyncModal from './GoogleSheetsSyncModal';
import HeaderSidebar from './HeaderSidebar';

interface FinanceManagerDashboardProps {
  currentUser: UserType;
  records: TransactionRecord[];
  onRefreshRecords: () => void;
  onLogout: () => void;
  onUserUpdate: (updatedUser: UserType) => void;
}

export default function FinanceManagerDashboard({
  currentUser,
  records,
  onRefreshRecords,
  onLogout,
  onUserUpdate
}: FinanceManagerDashboardProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');

  // Form toggles
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TransactionRecord | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [natureFilter, setNatureFilter] = useState<'All' | 'Income' | 'Expense'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Cash' | 'UPI' | 'Other'>('All');
  const [selectedRecord, setSelectedRecord] = useState<TransactionRecord | null>(null);

  // Card Dispute states
  const [disputingRecord, setDisputingRecord] = useState<TransactionRecord | null>(null);

  // Deletion confirmation and error states
  const [deleteConfirmRecordId, setDeleteConfirmRecordId] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);

  // Handle Create or Update save
  const handleSaveRecord = async (recordData: Omit<TransactionRecord, 'id' | 'createdBy' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    try {
      if (recordData.id) {
        // Update existing record
        await dbService.updateRecord(recordData.id, {
          transactionNature: recordData.transactionNature,
          moneySender: recordData.moneySender,
          moneyReceiver: recordData.moneyReceiver,
          transactionType: recordData.transactionType,
          amount: recordData.amount,
          purpose: recordData.purpose,
          transactionDate: recordData.transactionDate,
          notes: recordData.notes
        });
      } else {
        // Create new record
        const newRecord: TransactionRecord = {
          id: `rec_${Date.now()}`,
          transactionNature: recordData.transactionNature,
          moneySender: recordData.moneySender,
          moneyReceiver: recordData.moneyReceiver,
          transactionType: recordData.transactionType,
          amount: recordData.amount,
          purpose: recordData.purpose,
          transactionDate: recordData.transactionDate,
          notes: recordData.notes,
          createdBy: currentUser.userId,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await dbService.createRecord(newRecord);
      }

      onRefreshRecords();
      setShowForm(false);
      setEditingRecord(null);
      setSelectedRecord(null);
    } catch (err) {
      console.error('Error saving record', err);
      setLedgerError('Failed to save record. Please check Firestore connection.');
    }
  };

  const handleConfirmDeleteRecord = async () => {
    if (!deleteConfirmRecordId) return;
    try {
      await dbService.deleteRecord(deleteConfirmRecordId);
      onRefreshRecords();
      setSelectedRecord(null);
      setDeleteConfirmRecordId(null);
    } catch (err) {
      console.error('Error deleting record', err);
      setLedgerError('Failed to delete transaction. Please try again.');
    }
  };

  useEffect(() => {
    const handleOpenChat = () => {
      setIsChatOpen(true);
    };
    const handleOpenNotices = () => {
      setActiveTab('notices');
    };

    window.addEventListener('app:open-chat', handleOpenChat);
    window.addEventListener('app:open-notices', handleOpenNotices);

    return () => {
      window.removeEventListener('app:open-chat', handleOpenChat);
      window.removeEventListener('app:open-notices', handleOpenNotices);
    };
  }, []);

  // Track unread notices state
  const [hasUnreadNotices, setHasUnreadNotices] = useState(false);

  // Clear unread notices when opening the notices tab
  useEffect(() => {
    if (activeTab === 'notices') {
      setHasUnreadNotices(false);
      localStorage.setItem(`lastViewedNoticesTime_${currentUser.userId}`, new Date().toISOString());
    }
  }, [activeTab, currentUser.userId]);

  // Check for unread notices periodically
  useEffect(() => {
    const checkUnreadNotices = async () => {
      if (activeTab === 'notices') {
        setHasUnreadNotices(false);
        return;
      }

      try {
        const allNotices = await dbService.getNotices();
        if (!allNotices || allNotices.length === 0) {
          setHasUnreadNotices(false);
          return;
        }

        const lastViewed = localStorage.getItem(`lastViewedNoticesTime_${currentUser.userId}`);
        if (!lastViewed) {
          // If never viewed, check if there are any active reported notices by others
          const hasReportedByOthers = allNotices.some(
            n => n.reportedBy !== currentUser.userId && n.status === 'reported'
          );
          setHasUnreadNotices(hasReportedByOthers);
        } else {
          const lastViewedTime = new Date(lastViewed).getTime();
          const hasNewReportedByOthers = allNotices.some(
            n => n.reportedBy !== currentUser.userId && n.status === 'reported' && new Date(n.createdAt).getTime() > lastViewedTime
          );
          setHasUnreadNotices(hasNewReportedByOthers);
        }
      } catch (err) {
        console.error('Error checking unread notices:', err);
      }
    };

    checkUnreadNotices();
    const interval = setInterval(checkUnreadNotices, 5000);
    return () => clearInterval(interval);
  }, [activeTab, currentUser.userId]);

  // Filter logic memoized for optimal render performance
  const filteredRecords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return records.filter(r => {
      if (r.status !== 'active') return false;

      const matchesSearch = !q || 
        r.purpose.toLowerCase().includes(q) ||
        r.moneySender.toLowerCase().includes(q) ||
        r.moneyReceiver.toLowerCase().includes(q) ||
        (r.notes && r.notes.toLowerCase().includes(q));

      const matchesNature = natureFilter === 'All' || r.transactionNature === natureFilter;
      const matchesType = typeFilter === 'All' || r.transactionType === typeFilter;

      return matchesSearch && matchesNature && matchesType;
    });
  }, [records, searchQuery, natureFilter, typeFilter]);

  // Calculate quick sum
  const currentFilteredTotal = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + r.amount, 0);
  }, [filteredRecords]);

  return (
    <div id="finance-dashboard-root" className="min-h-screen bg-gray-50 flex flex-col justify-between">
      
      {/* HEADER CONTROLS */}
      <header className="glass-card !fixed top-0 left-0 right-0 z-40 py-1.5 px-4 shadow-sm border-b border-white/30 bg-white/45 backdrop-blur-md !w-full !h-auto !rounded-none">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GlassIcon icon={TrendingUp} variant="indigo" size="sm" className="shadow-sm" />
            <div>
              <h1 className="text-sm font-bold text-gray-950 tracking-tight">Mission Vikram Prakalp</h1>
              <p className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider">Finance Manager Console</p>
            </div>
          </div>
          <HeaderSidebar
            currentUser={currentUser}
            onOpenSheets={() => setIsSheetsModalOpen(true)}
            onOpenChat={() => setIsChatOpen(true)}
            onLogout={onLogout}
          />
        </div>
      </header>

      {/* Spacer to push content down below fixed header */}
      <div className="h-[48px] w-full shrink-0" />

      {/* STAGE MAIN */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={showForm ? 'form' : activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className="w-full"
          >
            {showForm ? (
              <div className="py-4">
            <RecordForm
              initialRecord={editingRecord}
              onSave={handleSaveRecord}
              onCancel={() => {
                setShowForm(false);
                setEditingRecord(null);
              }}
            />
          </div>
        ) : activeTab === 'home' ? (
          /* ==================== HOME PANEL ==================== */
          <div className="space-y-6">
            
            {/* ACTION TRIGGERS & QUICK STATS */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-950 tracking-tight">Financial Ledger Records</h2>
                <p className="text-xs text-gray-500">Record, search, and manage daily receipts and payments safely.</p>
              </div>
              <button
                onClick={() => {
                  setEditingRecord(null);
                  setShowForm(true);
                }}
                className="bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-5 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs text-xs self-start md:self-auto"
              >
                <Plus className="h-4.5 w-4.5" />
                Add Record
              </button>
            </div>

            {/* LEDGER ENTRIES CONTAINER */}
            <div className="max-w-3xl mx-auto w-full space-y-4">
              
              {ledgerError && (
                <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{ledgerError}</span>
                </div>
              )}

              {/* SEARCH & FILTERS CONTROLS */}
              <div className="glass-card p-4 rounded-2xl space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search transactions (purpose, sender, receiver...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800"
                  />
                </div>

                {/* CHIP FILTERS */}
                <div className="flex flex-wrap gap-2 pt-1 items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Nature:</span>
                  {(['All', 'Income', 'Expense'] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setNatureFilter(n)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                        natureFilter === n 
                          ? 'bg-gray-900 text-white' 
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {n}
                    </button>
                  ))}

                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-2 mr-1">Type:</span>
                  {(['All', 'Cash', 'UPI', 'Other'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                        typeFilter === t 
                          ? 'bg-gray-900 text-white' 
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* LEDGER STREAM */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  <span>Showing {filteredRecords.length} Entries</span>
                  <span>Total: ₹{currentFilteredTotal.toLocaleString('en-IN')}</span>
                </div>

                <div className="glass-card divide-y divide-gray-100 border-none rounded-2xl shadow-xs overflow-hidden">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map(rec => (
                      <div
                        key={rec.id}
                        onClick={() => setSelectedRecord(rec)}
                        className={`p-4 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-gray-50/70 transition-colors relative overflow-hidden select-none ${
                          selectedRecord?.id === rec.id ? 'bg-gray-50' : ''
                        }`}
                      >

                        <div className="flex items-center gap-3 min-w-0 relative z-10">
                          <div className={`p-2.5 rounded-xl shrink-0 ${
                            rec.transactionNature === 'Income' 
                              ? 'bg-emerald-50 text-emerald-600' 
                              : 'bg-rose-50 text-rose-600'
                          }`}>
                            {rec.transactionNature === 'Income' ? (
                              <ArrowDownLeft className="h-4.5 w-4.5" />
                            ) : (
                              <ArrowUpRight className="h-4.5 w-4.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-gray-900 truncate">{rec.purpose}</h4>
                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                              {rec.transactionNature === 'Income' ? `From: ${rec.moneySender}` : `To: ${rec.moneyReceiver}`}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-mono font-semibold bg-gray-100 px-1.5 py-0.5 rounded-md text-gray-500">
                                {rec.transactionType}
                              </span>
                              <span className="text-[9px] text-gray-400 flex items-center gap-1">
                                <Calendar className="h-3 w-3 shrink-0" />
                                {rec.transactionDate}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-3 relative z-10">
                          <div className="text-right">
                            <p className={`font-black text-sm ${
                              rec.transactionNature === 'Income' ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {rec.transactionNature === 'Income' ? '+' : '-'}₹{rec.amount.toLocaleString('en-IN')}
                            </p>
                            <p className="text-[8px] text-gray-400 uppercase font-bold tracking-wider mt-0.5">Record ID: {rec.id.slice(-5)}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-300" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-xs text-gray-400">
                      No transactions found matching your selection.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : activeTab === 'analytics' ? (
          /* ==================== ANALYTICS PANEL ==================== */
          <AnalyticsView records={records} />
        ) : activeTab === 'notices' && currentUser.role === 'Aarthik Pramukh' ? (
          /* ==================== DISPUTED LEDGER NOTICES FOR AARTHIK PRAMUKH ==================== */
          <NoticesPanel 
            currentUser={currentUser} 
            records={records} 
            onRefreshRecords={onRefreshRecords} 
            onToggleChat={() => setIsChatOpen(prev => !prev)}
          />
        ) : (
          /* ==================== PROFILE / SETTINGS PANEL ==================== */
          <ProfileView currentUser={currentUser} onUserUpdate={onUserUpdate} />
        )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* BOTTOM NAVIGATION DRAWER (MOBILE-FIRST) */}
      <nav id="bottom-navigation-drawer" className="glass-card !fixed bottom-0 left-0 right-0 py-2 px-6 z-20 shadow-2xl border-t border-white/30 backdrop-blur-xl !rounded-t-3xl !rounded-b-none !w-full !h-auto">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button
            onClick={() => {
              setActiveTab('home');
              setShowForm(false);
            }}
            className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
          >
            <GlassIcon 
              icon={Home} 
              variant="indigo" 
              size="sm" 
              glow={false}
              animated={activeTab === 'home' && !showForm}
              className={activeTab === 'home' && !showForm ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
            />
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'home' && !showForm ? 'text-indigo-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
            }`}>Home</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('analytics');
              setShowForm(false);
            }}
            className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
          >
            <GlassIcon 
              icon={TrendingUp} 
              variant="blue" 
              size="sm" 
              glow={false}
              animated={activeTab === 'analytics'}
              className={activeTab === 'analytics' ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
            />
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'analytics' ? 'text-blue-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
            }`}>Analytics</span>
          </button>

          {/* Notices panel tab for Aarthik Pramukh only */}
          {currentUser.role === 'Aarthik Pramukh' && (
            <button
              onClick={() => {
                setActiveTab('notices');
                setShowForm(false);
              }}
              className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
            >
              <GlassIcon 
                icon={AlertTriangle} 
                variant="rose" 
                size="sm" 
                glow={false}
                animated={activeTab === 'notices'}
                className={activeTab === 'notices' ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
                notificationActive={hasUnreadNotices}
              />
              <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
                activeTab === 'notices' ? 'text-rose-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
              }`}>Notice</span>
            </button>
          )}

          <button
            onClick={() => {
              setActiveTab('profile');
              setShowForm(false);
            }}
            className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
          >
            <GlassIcon 
              icon={User} 
              variant="amber" 
              size="sm" 
              glow={false}
              animated={activeTab === 'profile'}
              className={activeTab === 'profile' ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
            />
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'profile' ? 'text-amber-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
            }`}>Profile</span>
          </button>
        </div>
      </nav>

      {/* Record Deletion Confirmation Modal */}
      {deleteConfirmRecordId && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="bg-rose-50 p-2.5 rounded-xl">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-extrabold text-gray-950">
                Delete Ledger Record?
              </h3>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              Are you sure you want to permanently delete this transaction record? This action is irreversible and the transaction will be removed from the ledger database immediately.
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmRecordId(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition-colors cursor-pointer text-center text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRecord}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer text-center text-xs"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {disputingRecord && (
          <DisputeModal
            isOpen={!!disputingRecord}
            onClose={() => setDisputingRecord(null)}
            record={disputingRecord}
            currentUser={currentUser}
            onSuccess={onRefreshRecords}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRecord && (
          <RecordDetailsModal
            isOpen={!!selectedRecord}
            onClose={() => setSelectedRecord(null)}
            record={selectedRecord}
            onEdit={() => {
              setEditingRecord(selectedRecord);
              setShowForm(true);
            }}
            onDelete={() => {
              setDeleteConfirmRecordId(selectedRecord.id);
            }}
            onRaiseDispute={() => setDisputingRecord(selectedRecord)}
          />
        )}
      </AnimatePresence>

      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        records={records}
      />

      <ChatWidget 
        currentUser={currentUser} 
        isOpen={isChatOpen}
        setIsOpen={setIsChatOpen}
      />
    </div>
  );
}
