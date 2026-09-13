import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, X, Info } from 'lucide-react';
import { User, TransactionRecord, Notice } from '../types';
import { dbService } from '../services/dbService';

interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: TransactionRecord;
  currentUser: User;
  onSuccess: () => void;
}

export default function DisputeModal({
  isOpen,
  onClose,
  record,
  currentUser,
  onSuccess
}: DisputeModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('Incorrect Amount Entered');
  const [customReason, setCustomReason] = useState<string>('');
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const PRESET_REASONS = [
    'Incorrect Amount Entered',
    'Wrong Sender/Receiver Details',
    'Duplicate / Double Logged Entry',
    'Wrong Mode of Transaction (UPI vs Cash)',
    'Incorrect Purpose / Classification',
    'Other'
  ];

  useEffect(() => {
    if (isOpen) {
      setSelectedReason('Incorrect Amount Entered');
      setCustomReason('');
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (selectedReason === 'Other' && !customReason.trim()) {
      setErrorMessage('Please enter a custom reason description.');
      return;
    }
    
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const newNoticeId = 'notice_' + Math.random().toString(36).substring(2, 11);
    const newNotice: Notice = {
      id: newNoticeId,
      recordId: record.id,
      recordPurpose: record.purpose,
      recordAmount: record.amount,
      reason: selectedReason,
      customReason: selectedReason === 'Other' ? customReason.trim() : undefined,
      reportedBy: currentUser.userId,
      reporterName: currentUser.name,
      status: 'reported',
      createdAt: new Date().toISOString()
    };

    try {
      await dbService.createNotice(newNotice);
      setSuccessMessage(`Dispute successfully reported for "${record.purpose}"`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error submitting report:', err);
      setErrorMessage('Database error occurred while submitting dispute report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      id="dispute-modal-overlay" 
      className="fixed inset-0 bg-gray-900/40 flex items-center justify-center p-4 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div 
        className="bg-white border border-gray-100 rounded-3xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
        initial={{ opacity: 0, scale: 0.92, y: 25 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 25 }}
        transition={{ type: "spring", damping: 18, stiffness: 220 }}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-50 pb-3">
          <div className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
            <h3 className="text-sm font-extrabold text-gray-950">Report Ledger Discrepancy</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3.5 rounded-2xl text-xs font-bold leading-normal">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3.5 rounded-2xl text-xs font-bold leading-normal">
            {errorMessage}
          </div>
        )}

        {/* Selected record preview */}
        <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl text-xs space-y-2.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-200 pb-1.5">
            <Info className="h-3.5 w-3.5 text-gray-400" />
            Disputed Ledger Record Preview
          </p>
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="text-gray-400 block font-medium">Purpose</span>
              <strong className="text-gray-900 font-extrabold truncate block">{record.purpose}</strong>
            </div>
            <div>
              <span className="text-gray-400 block font-medium">Amount</span>
              <strong className="text-rose-600 font-black">₹{record.amount.toLocaleString('en-IN')}</strong>
            </div>
            <div>
              <span className="text-gray-400 block font-medium">Date logged</span>
              <span className="text-gray-800 font-medium">{record.transactionDate}</span>
            </div>
            <div>
              <span className="text-gray-400 block font-medium">Created By</span>
              <span className="text-gray-800 font-mono font-medium">{record.createdBy}</span>
            </div>
          </div>
        </div>

        {/* Dispute Reason */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">
            1. Select Dispute Reason
          </label>
          <div className="space-y-1.5">
            {PRESET_REASONS.map(reason => (
              <label 
                key={reason}
                className={`flex items-center gap-2.5 p-2.5 border rounded-2xl cursor-pointer transition-all ${
                  selectedReason === reason 
                    ? 'bg-gray-50 border-gray-300 font-bold text-gray-900' 
                    : 'border-gray-100 hover:bg-gray-50/40 text-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="disputeReasonModal"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={() => setSelectedReason(reason)}
                  className="text-gray-900 focus:ring-0 accent-gray-900 cursor-pointer h-3.5 w-3.5"
                />
                <span className="text-xs">{reason}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Custom textarea description */}
        {selectedReason === 'Other' && (
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Explain discrepancy reason
            </label>
            <textarea
              placeholder="Provide specific details about what is incorrect..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-3.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800 leading-normal"
            />
          </div>
        )}

        {/* Submit Dispute button */}
        <div className="pt-2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full py-3.5 px-5 rounded-2xl text-xs font-black uppercase tracking-wider text-center select-none transition-all duration-200 cursor-pointer ${
              isSubmitting 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-md'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              {isSubmitting ? 'Submitting Dispute...' : 'File Dispute'}
            </span>
          </button>
        </div>

      </motion.div>
    </motion.div>
  );
}
