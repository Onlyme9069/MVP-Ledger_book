import React from 'react';
import { motion } from 'motion/react';
import { X, Calendar, User, FileText, Info, ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react';
import { TransactionRecord } from '../types';

interface RecordDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: TransactionRecord;
  onEdit?: () => void;
  onDelete?: () => void;
  onRaiseDispute?: () => void;
}

export default function RecordDetailsModal({
  isOpen,
  onClose,
  record,
  onEdit,
  onDelete,
  onRaiseDispute
}: RecordDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <motion.div 
      id="record-details-modal-overlay" 
      className="fixed inset-0 bg-gray-900/40 flex items-center justify-center p-4 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div 
        id="record-details-modal-card"
        className="bg-white border border-gray-100 rounded-3xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
        initial={{ opacity: 0, scale: 0.92, y: 25 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 25 }}
        transition={{ type: "spring", damping: 18, stiffness: 220 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2 text-gray-800">
            {onRaiseDispute ? (
              <button
                onClick={() => {
                  onClose();
                  onRaiseDispute();
                }}
                className="focus:outline-none cursor-pointer flex items-center justify-center"
                title="Raise Dispute"
                id="header-raise-dispute-btn"
              >
                <Info className="h-5 w-5 text-gray-700" />
              </button>
            ) : (
              <Info className="h-5 w-5 text-gray-700" />
            )}
            <h3 className="text-sm font-extrabold text-gray-950">Record Details Inspector</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/40 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Main Info Amount Card */}
        <div className={`p-5 rounded-2xl flex items-center justify-between shadow-xs ${
          record.transactionNature === 'Income' ? 'bg-emerald-50/50 border border-emerald-100/30' : 'bg-rose-50/50 border border-rose-100/30'
        }`}>
          <div className="min-w-0">
            <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
              record.transactionNature === 'Income' ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              {record.transactionNature === 'Income' ? (
                <>
                  <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" />
                  Income Inflow
                </>
              ) : (
                <>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                  Expense Outflow
                </>
              )}
            </span>
            <p className={`text-2xl font-black mt-1 tracking-tight ${
              record.transactionNature === 'Income' ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              ₹{record.amount.toLocaleString('en-IN')}
            </p>
          </div>
          <span className={`text-[10px] font-extrabold uppercase px-3 py-1 rounded-full shrink-0 border shadow-2xs ${
            record.transactionType === 'UPI' 
              ? 'bg-blue-100/70 border-blue-200/50 text-blue-700'
              : record.transactionType === 'Cash'
              ? 'bg-amber-100/70 border-amber-200/50 text-amber-700'
              : 'bg-purple-100/70 border-purple-200/50 text-purple-700'
          }`}>
            {record.transactionType}
          </span>
        </div>

        {/* Details Fields List */}
        <div className="space-y-4 divide-y divide-white/10">
          
          {/* Purpose */}
          <div className="pt-1">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-gray-400" />
              Purpose
            </span>
            <p className="text-gray-900 font-extrabold mt-1 text-sm bg-white/30 p-2.5 rounded-xl border border-white/20">
              {record.purpose}
            </p>
          </div>

          {/* Sender & Receiver */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Money Sender</span>
              <p className="text-gray-800 font-bold mt-1 text-xs">{record.moneySender || '-'}</p>
            </div>
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Money Receiver</span>
              <p className="text-gray-800 font-bold mt-1 text-xs">{record.moneyReceiver || '-'}</p>
            </div>
          </div>

          {/* Transaction Date & Creator */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="h-3 w-3 text-gray-400" />
                Date
              </span>
              <p className="text-gray-800 font-bold mt-1 text-xs">{record.transactionDate}</p>
            </div>
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <User className="h-3 w-3 text-gray-400" />
                Recorded By
              </span>
              <p className="text-gray-800 font-bold mt-1 text-xs font-mono">{record.createdBy}</p>
            </div>
          </div>

          {/* Notes */}
          {record.notes && (
            <div className="pt-4">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Additional Notes</span>
              <p className="text-gray-600 mt-1.5 italic text-xs leading-relaxed bg-white/30 p-3 rounded-xl border border-white/25">
                "{record.notes}"
              </p>
            </div>
          )}

          {/* System Metadata timestamps */}
          <div className="pt-4 space-y-1 text-[10px] text-gray-400">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-300" />
              <span>Logged: {new Date(record.createdAt).toLocaleString('en-IN')}</span>
            </div>
            {record.updatedAt && record.updatedAt !== record.createdAt && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-gray-300" />
                <span>Updated: {new Date(record.updatedAt).toLocaleString('en-IN')}</span>
              </div>
            )}
            <p className="font-mono text-[9px] text-gray-300 pt-1">Record unique signature: {record.id}</p>
          </div>

        </div>

        {/* Modal Actions */}
        <div className="pt-2 border-t border-white/20 space-y-2">
          {(onEdit || onDelete) && (
            <div className="flex gap-2">
              {onEdit && (
                <button
                  onClick={() => {
                    onClose();
                    onEdit();
                  }}
                  className="flex-1 py-2.5 bg-white/40 hover:bg-white/60 text-gray-700 border border-white/25 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  Edit details
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    onClose();
                    onDelete();
                  }}
                  className="flex-1 py-2.5 bg-rose-50/50 hover:bg-rose-100/50 text-rose-600 border border-rose-100/40 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  Delete
                </button>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-950/80 hover:bg-gray-950/90 text-white backdrop-blur-md font-bold text-xs rounded-2xl tracking-wide uppercase transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>

      </motion.div>
    </motion.div>
  );
}
