import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setShowReconnected(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 backdrop-blur-md border border-amber-500/30 text-amber-200 text-xs font-semibold rounded-full shadow-lg flex items-center gap-2 pointer-events-auto"
        >
          <WifiOff className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
          <span>Offline Mode — Cached data active</span>
        </motion.div>
      )}

      {showReconnected && !isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 text-emerald-200 text-xs font-semibold rounded-full shadow-lg flex items-center gap-2 pointer-events-auto"
        >
          <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          <span>Back Online — Live sync reconnected</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
