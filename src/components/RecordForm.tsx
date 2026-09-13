import React, { useState, useEffect } from 'react';
import { Save, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { TransactionRecord } from '../types';

interface RecordFormProps {
  initialRecord?: TransactionRecord | null;
  onSave: (recordData: Omit<TransactionRecord, 'id' | 'createdBy' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}

export default function RecordForm({ initialRecord, onSave, onCancel }: RecordFormProps) {
  const [transactionNature, setTransactionNature] = useState<'Income' | 'Expense'>('Income');
  const [moneySender, setMoneySender] = useState('');
  const [moneyReceiver, setMoneyReceiver] = useState('');
  const [transactionType, setTransactionType] = useState<'Cash' | 'UPI' | 'Other'>('UPI');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRecord) {
      setTransactionNature(initialRecord.transactionNature);
      setMoneySender(initialRecord.moneySender);
      setMoneyReceiver(initialRecord.moneyReceiver);
      setTransactionType(initialRecord.transactionType);
      setAmount(initialRecord.amount.toString());
      setPurpose(initialRecord.purpose);
      setNotes(initialRecord.notes || '');
      setTransactionDate(initialRecord.transactionDate);
    } else {
      // Defaults for new record
      setTransactionNature('Income');
      setMoneySender('');
      setMoneyReceiver('MVP-Ledger'); // Default receiver for incoming donation
      setTransactionType('UPI');
      setAmount('');
      setPurpose('');
      setNotes('');
      // Set to local today's date formatted as YYYY-MM-DD
      const today = new Date().toLocaleDateString('en-CA'); // Outputs YYYY-MM-DD
      setTransactionDate(today);
    }
  }, [initialRecord]);

  // Dynamically swap defaults when nature swaps and fields are untouched/default
  const handleNatureChange = (nature: 'Income' | 'Expense') => {
    setTransactionNature(nature);
    if (nature === 'Income') {
      if (moneyReceiver === 'MVP-Ledger' || moneyReceiver === '') {
        setMoneyReceiver('MVP-Ledger');
      }
      if (moneySender === 'MVP-Ledger') {
        setMoneySender('');
      }
    } else {
      if (moneySender === 'MVP-Ledger' || moneySender === '') {
        setMoneySender('MVP-Ledger');
      }
      if (moneyReceiver === 'MVP-Ledger') {
        setMoneyReceiver('');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validations
    if (!moneySender.trim()) {
      setError('Please specify the Money Sender.');
      return;
    }
    if (!moneyReceiver.trim()) {
      setError('Please specify the Money Receiver.');
      return;
    }
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!purpose.trim()) {
      setError('Please provide a purpose.');
      return;
    }
    if (!transactionDate) {
      setError('Please select a transaction date.');
      return;
    }

    onSave({
      id: initialRecord?.id,
      transactionNature,
      moneySender: moneySender.trim(),
      moneyReceiver: moneyReceiver.trim(),
      transactionType,
      amount: numericAmount,
      purpose: purpose.trim(),
      transactionDate,
      notes: notes.trim()
    });
  };

  return (
    <motion.div 
      id="record-form-card" 
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm max-w-xl mx-auto"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 id="form-title" className="text-lg font-bold text-gray-900 tracking-tight">
          {initialRecord ? 'Modify Transaction Details' : 'Record New Transaction'}
        </h2>
        <button
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div id="form-error" className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 mb-6">
          {error}
        </div>
      )}

      {/* Selector for Income/Expense */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <button
          type="button"
          onClick={() => handleNatureChange('Income')}
          className={`py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 border text-xs cursor-pointer transition-all ${
            transactionNature === 'Income'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-xs'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <ArrowDownLeft className={`h-4 w-4 ${transactionNature === 'Income' ? 'text-emerald-600' : 'text-gray-400'}`} />
          Income
        </button>
        <button
          type="button"
          onClick={() => handleNatureChange('Expense')}
          className={`py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 border text-xs cursor-pointer transition-all ${
            transactionNature === 'Expense'
              ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-xs'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <ArrowUpRight className={`h-4 w-4 ${transactionNature === 'Expense' ? 'text-rose-600' : 'text-gray-400'}`} />
          Expense
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="moneySender" className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Money Sender
            </label>
            <input
              id="moneySender"
              type="text"
              placeholder="e.g. John Doe or Donor Name"
              value={moneySender}
              onChange={(e) => setMoneySender(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800"
            />
          </div>

          <div>
            <label htmlFor="moneyReceiver" className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Money Receiver
            </label>
            <input
              id="moneyReceiver"
              type="text"
              placeholder="e.g. Vendor or MVP-Ledger"
              value={moneyReceiver}
              onChange={(e) => setMoneyReceiver(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="transactionType" className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Transaction Mode
            </label>
            <select
              id="transactionType"
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as 'Cash' | 'UPI' | 'Other')}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-700 font-medium"
            >
              <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
              <option value="Cash">Cash</option>
              <option value="Other">Other (Bank Transfer / Cheque)</option>
            </select>
          </div>

          <div>
            <label htmlFor="amount" className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Amount in INR (₹)
            </label>
            <input
              id="amount"
              type="number"
              step="any"
              placeholder="₹ 0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800 font-bold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="purpose" className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
            Purpose
          </label>
          <input
            id="purpose"
            type="text"
            placeholder="e.g. Study Materials Printing, Fuel, Monthly Donation, Midday Meal"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800"
          />
        </div>

        <div>
          <label htmlFor="transactionDate" className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
            Transaction Date
          </label>
          <input
            id="transactionDate"
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800"
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
            Additional Notes (optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            placeholder="Provide any extra details about receipt/invoice, cheque numbers or specific donation earmarks..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800"
          />
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-50">
          <button
            type="button"
            onClick={onCancel}
            className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl transition-colors cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="w-2/3 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs text-center"
          >
            <Save className="h-4 w-4" />
            {initialRecord ? 'Save Changes' : 'Record Transaction'}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
