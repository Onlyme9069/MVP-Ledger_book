import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X, FileSpreadsheet, MessageSquare, LogOut, ShieldCheck, User as UserIcon, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import GlassIcon from './GlassIcon';
import { User } from '../types';
import { triggerHapticFeedback } from '../utils/haptics';

interface HeaderSidebarProps {
  currentUser: User;
  onOpenSheets: () => void;
  onOpenChat: () => void;
  onLogout: () => void;
}

export default function HeaderSidebar({
  currentUser,
  onOpenSheets,
  onOpenChat,
  onLogout
}: HeaderSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => {
    triggerHapticFeedback('light');
    setIsOpen(prev => !prev);
  };

  const handleSheetsClick = () => {
    triggerHapticFeedback('light');
    setIsOpen(false);
    onOpenSheets();
  };

  const handleChatClick = () => {
    triggerHapticFeedback('light');
    setIsOpen(false);
    onOpenChat();
  };

  const handleLogoutClick = () => {
    triggerHapticFeedback('medium');
    setIsOpen(false);
    onLogout();
  };

  return (
    <>
      {/* Sidebar Trigger Button in Top Right Header */}
      <button
        onClick={toggleSidebar}
        className="focus:outline-none rounded-xl cursor-pointer p-1 hover:bg-slate-100/80 transition-colors flex items-center justify-center"
        title="Open Navigation Menu"
      >
        <GlassIcon icon={Menu} variant="indigo" size="xs" className="shadow-xs" />
      </button>

      {/* Slide-out Sidebar Drawer Overlay & Panel */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div 
              style={{ zIndex: 99999999 }} 
              className="fixed inset-0 overflow-hidden pointer-events-auto"
            >
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsOpen(false)}
                style={{ zIndex: 1 }}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              />

              {/* Right Drawer Panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 280 }}
                style={{ zIndex: 2 }}
                className="absolute top-0 right-0 bottom-0 w-[280px] sm:w-[320px] bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-hidden safe-top safe-bottom"
              >
                {/* Drawer Header */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</h3>
                      <p className="text-[10px] text-indigo-600 font-semibold truncate">{currentUser.role}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Drawer Menu Body */}
                <div className="p-3 space-y-2 flex-1 overflow-y-auto">
                  <div className="px-2 pt-1 pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick Actions</span>
                  </div>

                  {/* 1. Google Sheets Sync */}
                  <button
                    onClick={handleSheetsClick}
                    className="w-full p-3 bg-slate-50/70 hover:bg-indigo-50/80 border border-slate-200/80 hover:border-indigo-200 rounded-xl flex items-center justify-between transition-all group cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 block group-hover:text-indigo-900">Google Sheets Sync</span>
                        <span className="text-[10px] text-slate-500 block">Backup & live ledger sync</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-transform group-hover:translate-x-0.5" />
                  </button>

                  {/* 2. Community Chat */}
                  <button
                    onClick={handleChatClick}
                    className="w-full p-3 bg-slate-50/70 hover:bg-emerald-50/80 border border-slate-200/80 hover:border-emerald-200 rounded-xl flex items-center justify-between transition-all group cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-teal-100 text-teal-700 rounded-lg group-hover:bg-teal-600 group-hover:text-white transition-colors">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 block group-hover:text-emerald-900">Community Chat</span>
                        <span className="text-[10px] text-slate-500 block">Internal messages & updates</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition-transform group-hover:translate-x-0.5" />
                  </button>

                  {/* 3. Sign Out */}
                  <button
                    onClick={handleLogoutClick}
                    className="w-full p-3 bg-rose-50/50 hover:bg-rose-100/80 border border-rose-200/80 rounded-xl flex items-center justify-between transition-all group cursor-pointer text-left mt-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-rose-100 text-rose-700 rounded-lg group-hover:bg-rose-600 group-hover:text-white transition-colors">
                        <LogOut className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-rose-900 block">Sign Out</span>
                        <span className="text-[10px] text-rose-600/80 block">End active session</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-rose-400 group-hover:text-rose-600 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>

                {/* Drawer Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-600">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Mission Vikram Prakalp</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Secure Ledger Management System</span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
