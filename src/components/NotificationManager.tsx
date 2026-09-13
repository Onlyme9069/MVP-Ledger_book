import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  MessageSquare, 
  AlertTriangle, 
  X, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { notificationService } from '../services/notificationService';
import { User } from '../types';

interface Toast {
  id: string;
  title: string;
  body: string;
  type: 'message' | 'dispute' | 'system';
  payload?: any;
}

interface NotificationManagerProps {
  currentUser: User;
}

export default function NotificationManager({ currentUser }: NotificationManagerProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showPromptBanner, setShowPromptBanner] = useState(false);

  // Timestamps to filter older messages and notices
  const loginTimeRef = useRef<string>(new Date().toISOString());
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Update permission state
  useEffect(() => {
    if (notificationService.isSupported()) {
      const current = notificationService.getPermissionState();
      if (current === 'default') {
        // Show a gentle prompt banner in the app to ask for push permission
        const timer = setTimeout(() => setShowPromptBanner(true), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Request browser push permission
  const handleRequestPermission = async () => {
    const result = await notificationService.requestPermission();
    setShowPromptBanner(false);
    
    if (result === 'granted') {
      notificationService.sendNotification(
        'Push Notifications Active',
        'You will now receive real-time alerts for chats and ledger disputes!'
      );
    }
  };

  // Poll for new messages and new disputes (notices) every 5 seconds
  useEffect(() => {
    if (!currentUser) return;

    // Load initial context once to avoid spamming existing entries
    const initializeTracker = async () => {
      try {
        const [messages, notices] = await Promise.all([
          dbService.getMessages(),
          dbService.getNotices()
        ]);
        
        // Populate processed list with all current items so we don't alert old ones
        if (messages) messages.forEach(m => processedIdsRef.current.add(m.id));
        if (notices) notices.forEach(n => processedIdsRef.current.add(n.id));
      } catch (err) {
        console.error('Error initializing notification trackers', err);
      }
    };

    initializeTracker();

    const checkNewEvents = async () => {
      try {
        const [messages, notices] = await Promise.all([
          dbService.getMessages(),
          dbService.getNotices()
        ]);

        // 1. Check for new messages
        if (messages) {
          messages.forEach(msg => {
            // Must not be from current user, must be either group chat or addressed directly to current user, and not yet processed
            const isTarget = msg.receiverId === 'all' || msg.receiverId === currentUser.userId;
            const isNotMe = msg.senderId !== currentUser.userId;
            
            if (isNotMe && isTarget && !processedIdsRef.current.has(msg.id)) {
              processedIdsRef.current.add(msg.id);
              
              // Only alert if message was created after user logged in/loaded page
              if (new Date(msg.createdAt) > new Date(loginTimeRef.current)) {
                triggerAlert({
                  id: msg.id,
                  title: `Message from @${msg.senderId}`,
                  body: msg.content.length > 60 ? `${msg.content.substring(0, 60)}...` : msg.content,
                  type: 'message',
                  payload: { senderId: msg.senderId }
                });
              }
            }
          });
        }

        // 2. Check for new disputes (notices)
        if (notices) {
          notices.forEach(notice => {
            // Must not be reported by current user and not yet processed
            const isNotMe = notice.reportedBy !== currentUser.userId;
            
            if (isNotMe && !processedIdsRef.current.has(notice.id)) {
              processedIdsRef.current.add(notice.id);

              if (new Date(notice.createdAt) > new Date(loginTimeRef.current)) {
                triggerAlert({
                  id: notice.id,
                  title: 'Wrong Ledger Dispute Raised!',
                  body: `Notice reported by @${notice.reportedBy} for "${notice.recordPurpose}" (Amount: ₹${notice.recordAmount.toLocaleString()})`,
                  type: 'dispute',
                  payload: notice
                });
              }
            }
          });
        }
      } catch (err) {
        console.warn('Error checking real-time events', err);
      }
    };

    // Poll every 5 seconds
    const interval = setInterval(checkNewEvents, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Listener to open correct interface when a custom trigger is received
  useEffect(() => {
    const handleTriggerMessageNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.senderId && customEvent.detail.senderId !== currentUser.userId) {
        // Optional quick local triggers
      }
    };
    
    window.addEventListener('app:new-message-arrived', handleTriggerMessageNotification);
    return () => window.removeEventListener('app:new-message-arrived', handleTriggerMessageNotification);
  }, [currentUser]);

  // Handle toast trigger
  const triggerAlert = (toast: Toast) => {
    const isAppVisible = document.visibilityState === 'visible';

    if (isAppVisible) {
      // App is open: ONLY show in-app floating pop up
      setToasts(prev => [...prev, toast]);
    } else {
      // App is closed/backgrounded: Send standard push notification
      notificationService.sendNotification(toast.title, toast.body);
      
      // Also append to local toasts list so it is visible when they return
      setToasts(prev => [...prev, toast]);
    }

    // Auto dismiss after 6 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, 6000);
  };

  // Close toast manually
  const handleCloseToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Handle click on toast to navigate to chat or notices panel
  const handleToastClick = (toast: Toast) => {
    handleCloseToast(toast.id);

    if (toast.type === 'message') {
      // Dispatch custom event to open chat widget globally
      const openChatEvent = new CustomEvent('app:open-chat', {
        detail: { receiverId: toast.payload?.senderId || 'all' }
      });
      window.dispatchEvent(openChatEvent);
    } else if (toast.type === 'dispute') {
      // Dispatch custom event to navigate to notices tab globally
      const openNoticesEvent = new CustomEvent('app:open-notices');
      window.dispatchEvent(openNoticesEvent);
    }
  };

  return (
    <>
      {/* In-App Floating Toasts Container (Header Popup Style) */}
      <div 
        id="app-notifications-container" 
        className="fixed top-14 left-1/2 -translate-x-1/2 z-[100000] w-full max-w-sm px-4 space-y-2.5 pointer-events-none"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="bg-white border border-gray-150 rounded-2xl shadow-xl pointer-events-auto overflow-hidden flex items-stretch cursor-pointer hover:border-gray-300 transition-all active:scale-[0.98]"
              onClick={() => handleToastClick(toast)}
            >
              {/* Type Indicator Color stripe */}
              <div className={`w-1.5 shrink-0 ${
                toast.type === 'message' 
                  ? 'bg-amber-500' 
                  : toast.type === 'dispute' 
                    ? 'bg-red-500 animate-pulse' 
                    : 'bg-gray-800'
              }`} />

              <div className="p-3.5 flex-1 flex gap-3 items-start min-w-0">
                {/* Icon based on type */}
                <div className={`p-2 rounded-xl shrink-0 ${
                  toast.type === 'message'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-red-50 text-red-600'
                }`}>
                  {toast.type === 'message' ? (
                    <MessageSquare className="h-4.5 w-4.5" />
                  ) : (
                    <AlertTriangle className="h-4.5 w-4.5" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-[11px] font-black text-gray-900 tracking-tight leading-snug">
                    {toast.title}
                  </h4>
                  <p className="text-[10px] text-gray-500 font-medium mt-0.5 leading-relaxed break-words">
                    {toast.body}
                  </p>
                  <span className="inline-flex items-center gap-0.5 text-[8px] text-gray-400 font-extrabold uppercase mt-1">
                    Click to view details <ChevronRight className="h-2.5 w-2.5" />
                  </span>
                </div>

                {/* Dismiss button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseToast(toast.id);
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Persistent Bottom banner prompt if permissions are not configured */}
      <AnimatePresence>
        {showPromptBanner && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 z-50 bg-gray-900 text-white p-4 rounded-2xl shadow-2xl border border-gray-800 animate-in fade-in duration-300"
          >
            <div className="flex gap-3 items-start">
              <div className="bg-amber-500/10 p-2.5 rounded-xl shrink-0 text-amber-400">
                <Bell className="h-5 w-5 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black tracking-tight flex items-center gap-1.5 text-gray-100">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  Stay Updated with Real-time Alerts
                </h4>
                <p className="text-[10px] text-gray-400 font-bold mt-1 leading-relaxed">
                  Enable push notifications to receive real-time updates on active ledger disputes and peer direct chat messages.
                </p>
                <div className="flex gap-2.5 mt-3">
                  <button
                    onClick={handleRequestPermission}
                    className="bg-amber-500 hover:bg-amber-600 text-gray-950 px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-colors cursor-pointer"
                  >
                    Enable Push
                  </button>
                  <button
                    onClick={() => setShowPromptBanner(false)}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    Not Now
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowPromptBanner(false)}
                className="text-gray-400 hover:text-gray-200 p-0.5 rounded transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
