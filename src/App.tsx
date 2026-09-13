import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { dbService } from './services/dbService';
import { googleSheetsService } from './services/googleSheetsService';
import { User, TransactionRecord } from './types';
import LoginScreen from './components/LoginScreen';
import FinanceManagerDashboard from './components/FinanceManagerDashboard';
import AdminDashboard from './components/AdminDashboard';
import NotificationManager from './components/NotificationManager';
import OfflineIndicator from './components/OfflineIndicator';
import PwaInstallManager from './components/PwaInstallManager';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecordsLoading, setIsRecordsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Listen to network status changes
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchRecordsList = useCallback(async () => {
    setIsRecordsLoading(true);
    try {
      const allRecords = await dbService.getRecords();
      const activeList = allRecords || [];
      setRecords(activeList);

      // Silent Auto-Sync to Google Sheets if configured
      if (googleSheetsService.isAutoSyncEnabled()) {
        const token = googleSheetsService.getCachedAccessToken();
        if (token) {
          googleSheetsService.syncRecords(activeList.filter(r => r.status !== 'deleted'), token).catch(e => {
            console.log('Background Google Sheets auto-sync deferred', e);
          });
        }
      }
    } catch (err) {
      console.error('Error fetching transactions', err);
    } finally {
      setIsRecordsLoading(false);
    }
  }, []);

  // 1. Initialize and Seed Database
  useEffect(() => {
    let isMounted = true;

    // Safety timeout: ensure initializing screen never hangs indefinitely
    const safetyTimer = setTimeout(() => {
      if (isMounted) setIsInitializing(false);
    }, 2500);

    const initializeApp = async () => {
      try {
        // Bootstrap Firestore collections and seed initial roles & records if needed
        await dbService.bootstrapDataIfNeeded();
        
        // Load persist login session if it exists in local storage
        const savedSession = localStorage.getItem('mvp_finance_session');
        if (savedSession) {
          try {
            const userObj = JSON.parse(savedSession) as User;
            // Fetch newest user doc from database to verify status/role
            const currentDbUser = await dbService.getUserByUserId(userObj.userId);
            if (isMounted && currentDbUser && currentDbUser.status === 'active') {
              setCurrentUser({
                ...currentDbUser,
                sessionToken: userObj.sessionToken,
              });
            } else {
              localStorage.removeItem('mvp_finance_session');
            }
          } catch (e) {
            console.error('Session restore error', e);
            localStorage.removeItem('mvp_finance_session');
          }
        }

        // Load records
        if (isMounted) {
          await fetchRecordsList();
        }
      } catch (err) {
        console.error('App initialization failure', err);
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    initializeApp();

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, [fetchRecordsList]);

  const handleLoginSuccess = useCallback((user: User) => {
    setCurrentUser(user);
    // Persist session to local storage
    localStorage.setItem('mvp_finance_session', JSON.stringify(user));
    // Fetch newest records list
    fetchRecordsList();
  }, [fetchRecordsList]);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('mvp_finance_session');
  }, []);

  const handleUserUpdate = useCallback((updatedUser: User) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('mvp_finance_session', JSON.stringify(updatedUser));
  }, []);

  // 2. Loading State Presentation
  if (isInitializing) {
    return (
      <div id="initializing-screen" className="min-h-screen bg-slate-50 bg-grid-pattern flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Floating background blobs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-400/10 blur-3xl animate-float-glow" />
          <div className="absolute bottom-[10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-400/10 blur-3xl animate-float-glow" style={{ animationDelay: '-3s' }} />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="bg-white border border-gray-150 rounded-2xl p-8 max-w-sm w-full shadow-lg text-center space-y-4 relative z-10"
        >
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 text-gray-900 animate-spin" />
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900 tracking-tight flex items-center justify-center gap-1.5">
              <ShieldCheck className="h-4.5 w-4.5 text-gray-800" />
              Mission Vikram Prakalp
            </h2>
            <p className="text-[10px] text-gray-500 font-bold tracking-wide uppercase mt-1">Initializing Ledger...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // 3. Authenticated Router & Main Layout
  const renderContent = () => {
    if (!currentUser) {
      return (
        <motion.div 
          key="login"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25 }}
          className="min-h-screen flex items-center justify-center p-4 w-full"
        >
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        </motion.div>
      );
    }

    if (currentUser.role === 'Finance Manager' || currentUser.role === 'Aarthik Pramukh') {
      return (
        <motion.div 
          key="finance-dashboard"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25 }}
          className="w-full flex-1 flex flex-col"
        >
          <FinanceManagerDashboard
            currentUser={currentUser}
            records={records}
            onRefreshRecords={fetchRecordsList}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
          />
        </motion.div>
      );
    }

    return (
      <motion.div 
        key="admin-dashboard"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.25 }}
        className="w-full flex-1 flex flex-col"
      >
        <AdminDashboard
          currentUser={currentUser}
          records={records}
          onRefreshRecords={fetchRecordsList}
          onLogout={handleLogout}
          onUserUpdate={handleUserUpdate}
        />
      </motion.div>
    );
  };

  return (
    <div className="relative min-h-screen bg-slate-50 bg-grid-pattern text-slate-900 selection:bg-slate-200 flex flex-col">
      <OfflineIndicator />
      <PwaInstallManager />
      {/* Floating decorative gradient blobs for glassmorphism */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-400/8 blur-3xl animate-float-glow" />
        <div className="absolute bottom-[5%] -right-[10%] w-[60%] h-[60%] rounded-full bg-emerald-400/8 blur-3xl animate-float-glow" style={{ animationDelay: '-3s' }} />
        <div className="absolute top-[35%] right-[15%] w-[35%] h-[35%] rounded-full bg-indigo-400/6 blur-3xl animate-float-glow" style={{ animationDelay: '-5s' }} />
      </div>

      <AnimatePresence mode="wait">
        {isOffline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-600 text-white text-[11px] md:text-xs font-bold px-4 py-2.5 text-center flex items-center justify-center gap-2 select-none z-50 shadow-xs border-b border-amber-700 shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-white shrink-0 animate-ping" />
            <span>Running in Offline Mode — All financial records are saved securely in local storage and will sync when online.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col relative z-10 w-full">
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </div>

      {currentUser && <NotificationManager currentUser={currentUser} />}
    </div>
  );
}
