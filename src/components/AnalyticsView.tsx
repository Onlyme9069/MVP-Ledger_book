import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CreditCard, 
  PieChart as PieIcon, 
  BarChart2, 
  Activity,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ChevronDown,
  X
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import { TransactionRecord, Organization } from '../types';
import { dbService } from '../services/dbService';
import { gsap } from 'gsap';

interface AnalyticsViewProps {
  records: TransactionRecord[];
}

export default function AnalyticsView({ records }: AnalyticsViewProps) {
  // Load organization budget info
  const [org, setOrg] = useState<Organization | null>(null);
  
  // Date tracking: Default to current month
  const today = new Date();
  const currentMonthStr = today.toISOString().substring(0, 7); // "YYYY-MM"
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Refs for smooth animations and positioning
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Position coordinates for rendering the dropdown popup outside the dashboard container tree
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  // Track scroll lock and dynamically measure and position dropdown popup
  useEffect(() => {
    if (!isDatePickerOpen) {
      document.body.style.overflow = '';
      return;
    }

    // Lock body scroll to prevent background interaction and keep dropdown aligned
    document.body.style.overflow = 'hidden';

    const updateCoords = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        });
      }
    };

    // Calculate coordinates on open
    updateCoords();

    // Listen to resize and scroll to keep coordinates perfect on all screens (e.g. rotate Android device)
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords);
    };
  }, [isDatePickerOpen]);

  useEffect(() => {
    if (isDatePickerOpen) {
      if (backdropRef.current) {
        gsap.fromTo(backdropRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.2, ease: 'power1.out' }
        );
      }
      if (menuRef.current) {
        const isMobile = window.innerWidth < 640;
        if (isMobile) {
          gsap.fromTo(menuRef.current,
            { y: '100%', opacity: 0 },
            { y: '0%', opacity: 1, duration: 0.28, ease: 'power3.out' }
          );
        } else {
          gsap.fromTo(menuRef.current,
            { opacity: 0, scale: 0.95, y: -10 },
            { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'power2.out' }
          );
        }
      }
    }
  }, [isDatePickerOpen]);

  useEffect(() => {
    dbService.getOrganization()
      .then(o => setOrg(o))
      .catch(err => console.error('Error fetching org in AnalyticsView', err));
  }, []);

  // GSAP animations when selectedMonth changes
  useEffect(() => {
    if (containerRef.current) {
      const elements = containerRef.current.querySelectorAll('.gsap-animate');
      if (elements.length > 0) {
        gsap.killTweensOf(elements);
        gsap.fromTo(
          elements,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, ease: 'power2.out' }
        );
      }
    }
  }, [selectedMonth]);

  // Filter active transactions
  const activeRecords = records.filter(r => r.status === 'active');

  // Generate list of available months with data, plus current month
  const availableMonths = Array.from(
    new Set([
      currentMonthStr,
      ...activeRecords.map(r => r.transactionDate.substring(0, 7))
    ])
  )
    .filter(m => m && m.length === 7)
    .sort((a, b) => b.localeCompare(a)); // Newest first

  // Format month name (e.g. "2026-07" -> "July 2026")
  const formatMonthLabel = (mStr: string) => {
    if (!mStr) return '';
    const [year, month] = mStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  // 1. Calculate Monthly Metrics (Reset every month, calculating from start of month 1st day only)
  const monthlyIncome = activeRecords
    .filter(r => r.transactionNature === 'Income' && r.transactionDate.startsWith(selectedMonth))
    .reduce((sum, r) => sum + r.amount, 0);

  const monthlyExpense = activeRecords
    .filter(r => r.transactionNature === 'Expense' && r.transactionDate.startsWith(selectedMonth))
    .reduce((sum, r) => sum + r.amount, 0);

  // 2. Cumulative Reserves (Continue available reserves to next months)
  // Sums up all incomes of previous & selected months, minus all expenses of previous & selected months
  const cumulativeIncome = activeRecords
    .filter(r => r.transactionNature === 'Income' && r.transactionDate.substring(0, 7) <= selectedMonth)
    .reduce((sum, r) => sum + r.amount, 0);

  const cumulativeExpense = activeRecords
    .filter(r => r.transactionNature === 'Expense' && r.transactionDate.substring(0, 7) <= selectedMonth)
    .reduce((sum, r) => sum + r.amount, 0);

  const netBalance = cumulativeIncome - cumulativeExpense;
  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpense) / monthlyIncome) * 100 : 0;

  // Monthly/Yearly Budget Utilization Math
  const selectedYear = selectedMonth.substring(0, 4);

  const currentMonthExpenses = monthlyExpense; // Aligned with the selected month

  const currentYearExpenses = activeRecords
    .filter(r => r.transactionNature === 'Expense' && r.transactionDate.startsWith(selectedYear))
    .reduce((sum, r) => sum + r.amount, 0);

  // 3. Transaction Type Breakdown for current selected month (Cash vs UPI vs Other)
  const modeDataMap: Record<string, { Income: number; Expense: number }> = {
    UPI: { Income: 0, Expense: 0 },
    Cash: { Income: 0, Expense: 0 },
    Other: { Income: 0, Expense: 0 }
  };

  activeRecords
    .filter(r => r.transactionDate.startsWith(selectedMonth))
    .forEach(r => {
      const type = r.transactionType;
      if (modeDataMap[type]) {
        if (r.transactionNature === 'Income') {
          modeDataMap[type].Income += r.amount;
        } else {
          modeDataMap[type].Expense += r.amount;
        }
      }
    });

  const modeChartData = Object.keys(modeDataMap).map(mode => ({
    name: mode,
    Income: modeDataMap[mode].Income,
    Expense: modeDataMap[mode].Expense
  }));

  // 4. Daily flow trends inside the selected month
  const dateMap: Record<string, { date: string; Income: number; Expense: number }> = {};
  
  activeRecords
    .filter(r => r.transactionDate.startsWith(selectedMonth))
    .forEach(r => {
      const date = r.transactionDate;
      if (!dateMap[date]) {
        // Just extract the day number (DD) to keep chart clean
        const dayLabel = date.substring(8);
        dateMap[date] = { date: dayLabel, Income: 0, Expense: 0 };
      }
      if (r.transactionNature === 'Income') {
        dateMap[date].Income += r.amount;
      } else {
        dateMap[date].Expense += r.amount;
      }
    });

  const trendData = Object.values(dateMap)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 5. Purpose Breakdown for selected month expenses
  const expensePurposeMap: Record<string, number> = {};
  activeRecords
    .filter(r => r.transactionNature === 'Expense' && r.transactionDate.startsWith(selectedMonth))
    .forEach(r => {
      const p = r.purpose.trim();
      expensePurposeMap[p] = (expensePurposeMap[p] || 0) + r.amount;
    });

  const expensePurposeData = Object.keys(expensePurposeMap)
    .map(name => ({ name, value: expensePurposeMap[name] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5); // Top 5 purposes

  const COLORS = ['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8'];

  return (
    <div id="analytics-container" ref={containerRef} className="space-y-6">
      {/* Header with glassmorphism */}
      <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4 gsap-animate">
        <div className="flex items-center gap-3">
          <div className="bg-gray-950/5 text-gray-900 p-2.5 rounded-xl border border-gray-950/10">
            <Activity className="h-5 w-5 text-gray-900" />
          </div>
          <div>
            <h2 id="analytics-title" className="text-base font-black text-gray-900 tracking-tight">Financial Analytics</h2>
            <p className="text-[11px] text-gray-500 font-medium">
              Calculations starting from the 1st of <span className="font-bold text-gray-800">{formatMonthLabel(selectedMonth)}</span>
            </p>
          </div>
        </div>

        {/* Selected Month Selector (Dropdown button rendering popup via Portal) */}
        <div className="self-start sm:self-center">
          <button
            ref={buttonRef}
            onClick={() => setIsDatePickerOpen(true)}
            className="flex items-center gap-2 bg-gray-950 hover:bg-gray-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
          >
            <Calendar className="h-4 w-4" />
            <span>{formatMonthLabel(selectedMonth)}</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {isDatePickerOpen && createPortal(
            <>
              {/* Dark backdrop overlay that dims the page and blocks all background interactions */}
              <div 
                ref={backdropRef}
                className="fixed inset-0 bg-black/40 z-[99999]"
                onClick={() => setIsDatePickerOpen(false)}
              />
              
              {/* Floating Menu / Bottom Sheet - completely isolated outside dashboard container hierarchy */}
              <div 
                ref={menuRef}
                style={window.innerWidth >= 640 && coords ? {
                  position: 'fixed',
                  top: `${coords.top + 8}px`,
                  left: `${Math.max(16, coords.left + coords.width - 320)}px`,
                } : {}}
                className={`
                  !fixed bottom-0 left-0 right-0 z-[100000] flex flex-col bg-white border-t border-gray-150 rounded-t-[24px] shadow-2xl p-5 max-h-[380px] pb-6 overscroll-y-contain
                  sm:!fixed sm:bottom-auto sm:left-auto sm:right-auto sm:rounded-2xl sm:w-80 sm:max-h-[360px] sm:shadow-2xl sm:border sm:border-gray-200 sm:p-4 sm:pb-4 sm:rounded-b-2xl
                `}
              >
                {/* Mobile Bottom Sheet drag handle */}
                <div className="block sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />

                <div className="flex items-center justify-between border-b border-gray-150 pb-2.5 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                      <Calendar className="h-4 w-4 text-gray-700" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-gray-900">Select Month</h3>
                      <p className="text-[9px] text-gray-400 font-bold">Choose period to inspect</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsDatePickerOpen(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="overflow-y-auto space-y-1 max-h-[190px] overscroll-y-contain pr-1">
                  {availableMonths.map((mStr) => (
                    <button
                      key={mStr}
                      onClick={() => {
                        setSelectedMonth(mStr);
                        setIsDatePickerOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                        selectedMonth === mStr 
                          ? 'bg-gray-950 text-white font-bold' 
                          : 'hover:bg-gray-50 text-gray-700 border border-transparent hover:border-gray-200'
                      }`}
                    >
                      <span>{formatMonthLabel(mStr)}</span>
                      {selectedMonth === mStr ? (
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      ) : (
                        <span className="text-[9px] text-gray-400 font-mono">{mStr}</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="border-t border-white/20 pt-2.5 mt-2.5 flex justify-end">
                  <button
                    onClick={() => setIsDatePickerOpen(false)}
                    className="bg-white/40 hover:bg-white/60 text-gray-800 text-[10px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-colors border border-white/35"
                  >
                    Close
                  </button>
                </div>
              </div>
            </>,
            document.body
          )}
        </div>
      </div>

      {/* METRICS GRID with glassmorphism */}
      <div id="metrics-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Monthly Income */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between gsap-animate">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Monthly Inflow</p>
            <h3 className="text-xl font-black text-emerald-600 tracking-tight">₹{monthlyIncome.toLocaleString('en-IN')}</h3>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold mt-4">
            <TrendingUp className="h-3.5 w-3.5" />
            Reset Monthly
          </div>
        </div>

        {/* Total Monthly Expenses */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between gsap-animate">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Monthly Outflow</p>
            <h3 className="text-xl font-black text-rose-600 tracking-tight">₹{monthlyExpense.toLocaleString('en-IN')}</h3>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-rose-600 font-bold mt-4">
            <TrendingDown className="h-3.5 w-3.5" />
            Reset Monthly
          </div>
        </div>

        {/* Cumulative Reserves Continued */}
        <div className="bg-gray-50 border border-gray-150 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between gsap-animate">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Cumulative Reserves</p>
            <h3 className={`text-xl font-black tracking-tight ${netBalance >= 0 ? 'text-gray-900' : 'text-rose-700'}`}>
              ₹{netBalance.toLocaleString('en-IN')}
            </h3>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-600 font-bold mt-4">
            <DollarSign className="h-3.5 w-3.5" />
            Continued Forward
          </div>
        </div>

        {/* Savings Efficiency */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between gsap-animate">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Savings Rate</p>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">{savingsRate.toFixed(1)}%</h3>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold mt-4">
            <CreditCard className="h-3.5 w-3.5" />
            Monthly Ratio
          </div>
        </div>
      </div>

      {/* BUDGET STATUS TRACKER with glassmorphism */}
      {(org?.monthlyBudget || org?.yearlyBudget) ? (
        <div id="budget-utilization-panel" className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm space-y-4 gsap-animate">
          <div className="flex items-center justify-between border-b border-gray-100/50 pb-2.5">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-gray-600" />
              Budget Utilization Tracker ({formatMonthLabel(selectedMonth)})
            </h3>
            <span className="text-[9px] font-bold text-gray-400 bg-gray-50/80 px-2.5 py-1 rounded-md uppercase tracking-wider border border-gray-100">
              Live Tracker
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Monthly Budget Card */}
            {org.monthlyBudget ? (() => {
              const pct = (currentMonthExpenses / org.monthlyBudget) * 100;
              const isOver = currentMonthExpenses > org.monthlyBudget;
              return (
                <div className="space-y-2">
                  <div className="flex justify-between items-end text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Monthly Budget Limit</p>
                      <p className="text-sm font-black text-gray-800 mt-0.5">
                        ₹{currentMonthExpenses.toLocaleString('en-IN')} <span className="text-gray-400 font-normal">of ₹{org.monthlyBudget.toLocaleString('en-IN')}</span>
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                      isOver ? 'bg-red-50 text-red-700' : pct >= 90 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {isOver ? (
                        <>
                          <AlertTriangle className="h-3 w-3" />
                          Limit Exceeded ({pct.toFixed(0)}%)
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          {pct.toFixed(0)}% Utilized
                        </>
                      )}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 rounded-full ${
                        isOver ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-gray-800'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-gray-400 italic">
                    For selected month: {formatMonthLabel(selectedMonth)}
                  </p>
                </div>
              );
            })() : (
              <div className="bg-gray-50/50 border border-dashed border-gray-200/60 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Monthly Budget</p>
                <p className="text-xs text-gray-400 mt-1">Limits not set for this period.</p>
              </div>
            )}

            {/* Yearly Budget Card */}
            {org.yearlyBudget ? (() => {
              const pct = (currentYearExpenses / org.yearlyBudget) * 100;
              const isOver = currentYearExpenses > org.yearlyBudget;
              return (
                <div className="space-y-2">
                  <div className="flex justify-between items-end text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Yearly Budget Limit ({selectedYear})</p>
                      <p className="text-sm font-black text-gray-800 mt-0.5">
                        ₹{currentYearExpenses.toLocaleString('en-IN')} <span className="text-gray-400 font-normal">of ₹{org.yearlyBudget.toLocaleString('en-IN')}</span>
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                      isOver ? 'bg-red-50 text-red-700' : pct >= 90 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {isOver ? (
                        <>
                          <AlertTriangle className="h-3 w-3" />
                          Limit Exceeded ({pct.toFixed(0)}%)
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          {pct.toFixed(0)}% Utilized
                        </>
                      )}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 rounded-full ${
                        isOver ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-gray-800'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-gray-400 italic">
                    Cumulative for year: {selectedYear}
                  </p>
                </div>
              );
            })() : (
              <div className="bg-gray-50/50 border border-dashed border-gray-200/60 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Yearly Budget</p>
                <p className="text-xs text-gray-400 mt-1">Limits not set for this year.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* CHARTS LAYER with glassmorphism */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Analysis */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm gsap-animate">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <BarChart2 className="h-4 w-4 text-gray-500" />
            Daily Flows inside {formatMonthLabel(selectedMonth)} (Inflow vs Outflow)
          </h3>
          <div className="h-64 w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" name="Day" tick={{ fontSize: 9 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} />
                  <Tooltip formatter={(value) => [`₹${value}`, '']} labelFormatter={(label) => `Day ${label}`} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                  <Line type="monotone" dataKey="Income" name="Daily Inflow" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Expense" name="Daily Outflow" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-xs text-gray-400 space-y-2">
                <Activity className="h-8 w-8 text-gray-300" />
                <span>No transaction activity in this month.</span>
              </div>
            )}
          </div>
        </div>

        {/* Transaction Type Breakdown */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm gsap-animate">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <CreditCard className="h-4 w-4 text-gray-500" />
            Modes of Transaction in {formatMonthLabel(selectedMonth)}
          </h3>
          <div className="h-64 w-full">
            {monthlyIncome > 0 || monthlyExpense > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} />
                  <Tooltip formatter={(value) => [`₹${value}`, '']} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                  <Bar dataKey="Income" name="Inflow Amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expense" name="Outflow Amount" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-xs text-gray-400 space-y-2">
                <CreditCard className="h-8 w-8 text-gray-300" />
                <span>No payments registered in this month.</span>
              </div>
            )}
          </div>
        </div>

        {/* Expense Purpose Breakdown */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm lg:col-span-2 gsap-animate">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <PieIcon className="h-4 w-4 text-gray-500" />
            Organization Expense Distribution (Top 5 Purposes)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="h-56 w-full">
              {expensePurposeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensePurposeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {expensePurposeData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`₹${value}`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-xs text-gray-400 space-y-2">
                  <PieIcon className="h-8 w-8 text-gray-300" />
                  <span>No outflows found for this month to analyze.</span>
                </div>
              )}
            </div>
            
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expense Focus Distribution</h4>
              {expensePurposeData.length > 0 ? (
                <div className="space-y-2">
                  {expensePurposeData.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                        <span className="text-gray-700 truncate max-w-[180px] font-medium">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-950">₹{item.value.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No expense purposes registered in this period.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
