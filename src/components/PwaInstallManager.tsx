import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, CheckCircle2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerHapticFeedback } from '../utils/haptics';

export default function PwaInstallManager() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);

  useEffect(() => {
    // Check if running in standalone mode (Installed PWA)
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true ||
        document.referrer.includes('android-app://');

      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // Capture Chrome's WebAPK install event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Automatically show banner if not in standalone
      if (!isStandalone) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [isStandalone]);

  const handleInstallClick = async () => {
    triggerHapticFeedback('medium');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      // If deferredPrompt is unavailable, show native WebAPK setup instructions
      setShowGuideModal(true);
    }
  };

  // Do not render anything if already running as installed Standalone App
  if (isStandalone) {
    return null;
  }

  return (
    <>
      {/* Floating Native App Install Banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-40 bg-slate-900/95 text-white p-3.5 rounded-2xl shadow-2xl border border-emerald-500/30 backdrop-blur-md flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  Install MVP Ledger
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 font-semibold px-1.5 py-0.5 rounded">Native App</span>
                </h4>
                <p className="text-[11px] text-slate-300">Install as standalone app (no Chrome tabs or URL bar)</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInstallClick}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Install</span>
              </button>
              <button
                onClick={() => setShowBanner(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual WebAPK Setup Guide Modal */}
      <AnimatePresence>
        {showGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">How to Fix Standalone App Install</h3>
                    <p className="text-[11px] text-slate-500">Run as full application without Chrome tabs</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                  <span className="font-bold text-xs flex items-center gap-1">
                    <Info className="h-4 w-4 text-amber-600 shrink-0" />
                    Why did it open in Chrome tabs before?
                  </span>
                  <p className="text-[11px] text-amber-800">
                    If you selected standard "Add to Home screen", Chrome created a web shortcut instead of an actual Android WebAPK app.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="font-bold text-slate-800 block">Follow these 2 simple steps to fix it:</span>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-700 text-[11px]">
                    <li><strong>Delete old shortcut:</strong> Remove any old shortcut icon from your phone home screen.</li>
                    <li><strong>Open in Chrome:</strong> Open this link in mobile Chrome: <br /><code className="text-[10px] bg-slate-100 p-1 rounded font-mono break-all block mt-1">{window.location.href}</code></li>
                    <li><strong>Install App:</strong> Click Chrome menu (⋮) → Select <strong>"Install app"</strong> (not Add to Home Screen).</li>
                  </ol>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Once installed, it will open as a dedicated native app in your App Drawer without Chrome browser tabs or address bar!</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
