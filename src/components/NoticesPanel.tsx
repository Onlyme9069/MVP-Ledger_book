import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  User, 
  Calendar,
  Send
} from 'lucide-react';
import { User as UserType, TransactionRecord, Notice } from '../types';
import { dbService } from '../services/dbService';

interface NoticesPanelProps {
  currentUser: UserType;
  records: TransactionRecord[];
  onRefreshRecords: () => void;
  onToggleChat?: () => void;
}

export default function NoticesPanel({
  currentUser,
  records,
  onRefreshRecords,
  onToggleChat
}: NoticesPanelProps) {
  // Notices states
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isNoticesLoading, setIsNoticesLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'reported' | 'resolved'>('all');

  const fetchNotices = async () => {
    setIsNoticesLoading(true);
    try {
      const allNotices = await dbService.getNotices();
      setNotices(allNotices || []);
    } catch (err) {
      console.error('Error loading notices:', err);
    } finally {
      setIsNoticesLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  // Filter notices for display
  const displayedNotices = notices.filter(n => {
    if (filterType === 'all') return true;
    return n.status === filterType;
  });

  // Handle the Resolve action
  const handleResolveNotice = async (noticeId: string) => {
    try {
      await dbService.resolveNotice(noticeId);
      // Refresh local list and outer ledger list
      fetchNotices();
      onRefreshRecords();
    } catch (err) {
      console.error('Failed to resolve notice:', err);
    }
  };

  return (
    <div id="notices-panel-container" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-950 tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse shrink-0" />
            Wrong Ledger Dispute Terminal
          </h2>
          <p className="text-xs text-gray-500">View reported ledger discrepancies and monitor resolution status.</p>
        </div>
        <div className="flex items-center gap-2.5 self-start shrink-0">
          {onToggleChat && (
            <button
              onClick={onToggleChat}
              className="flex items-center gap-2 bg-gray-950 text-white hover:bg-gray-800 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95"
              title="Open Chat Panel"
            >
              <Send className="h-3.5 w-3.5" />
              Chat
            </button>
          )}
          <button
            onClick={() => { fetchNotices(); onRefreshRecords(); }}
            className="flex items-center gap-1.5 bg-white border border-gray-100 hover:bg-gray-50 px-3 py-1.5 rounded-xl text-[11px] font-bold text-gray-600 transition-colors cursor-pointer shadow-xs"
          >
            <RefreshCw className={`h-3 w-3 ${isNoticesLoading ? 'animate-spin' : ''}`} />
            Refresh Lists
          </button>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Disputes Notice Board</span>
          
          {/* CHIP FILTERS */}
          <div className="flex gap-1.5">
            {(['all', 'reported', 'resolved'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                  filterType === type 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* NOTICES LIST */}
        {isNoticesLoading ? (
          <div className="py-12 text-center text-xs text-gray-400 flex flex-col items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin mb-2.5 text-gray-300" />
            Retrieving reported disputes...
          </div>
        ) : displayedNotices.length > 0 ? (
          <div className="space-y-3">
            {displayedNotices.map((notice) => {
              const isPending = notice.status === 'reported';
              return (
                <div 
                  key={notice.id} 
                  id={`notice-card-${notice.id}`}
                  className={`p-4 border rounded-2xl transition-all duration-200 ${
                    isPending 
                      ? 'bg-amber-50/40 border-amber-100/70 shadow-2xs hover:bg-amber-50/60' 
                      : 'bg-gray-50/50 border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider ${
                          isPending 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isPending ? '⚠️ Active Dispute' : '✅ Resolved'}
                        </span>
                        <span className="text-[9px] font-mono font-bold text-gray-400">
                          Report ID: {notice.id.slice(-6).toUpperCase()}
                        </span>
                      </div>

                      <h4 className="text-xs font-extrabold text-gray-900 leading-tight">
                        {notice.recordPurpose}
                      </h4>
                      
                      <p className="text-xs font-black text-rose-600">
                        Amount in Question: ₹{notice.recordAmount.toLocaleString('en-IN')}
                      </p>

                      <div className="mt-3 pt-2 border-t border-gray-100/50 space-y-1.5 text-[11px]">
                        <p className="text-gray-700">
                          <strong className="text-gray-900 font-bold">Discrepancy Category:</strong> {notice.reason}
                        </p>
                        {notice.customReason && (
                          <p className="text-gray-600 bg-white/70 border border-gray-100 p-2 rounded-lg italic">
                            "{notice.customReason}"
                          </p>
                        )}
                      </div>

                      <div className="pt-2 text-[9px] text-gray-400 flex flex-wrap gap-x-3 gap-y-1 font-medium">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          By: {notice.reporterName} ({notice.reportedBy})
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          On: {new Date(notice.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* RESOLUTION ACTIONS */}
                    {isPending && (
                      <button
                        onClick={() => handleResolveNotice(notice.id)}
                        className="bg-white border border-gray-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all p-2 rounded-xl shrink-0 cursor-pointer flex flex-col items-center justify-center text-center gap-1 shadow-2xs"
                        title="Mark dispute resolved/rectified"
                      >
                        <CheckCircle className="h-4.5 w-4.5 text-gray-400 hover:text-emerald-600 transition-colors" />
                        <span className="text-[8px] font-black uppercase tracking-wider text-gray-500">Resolve</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center text-xs text-gray-400 flex flex-col items-center justify-center">
            <CheckCircle className="h-8 w-8 text-emerald-100 mb-3" />
            No discrepancies reported on the notice board. Ledger records are pristine.
          </div>
        )}
      </div>


    </div>
  );
}
