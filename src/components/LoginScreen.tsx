import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Shield, Fingerprint, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';
import { dbService, hashPassword } from '../services/dbService';
import { User } from '../types';
import { motion } from 'motion/react';
import { webAuthnService } from '../services/webAuthn';
import { safeParseJsonResponse } from '../utils/apiUtils';
import { triggerHapticFeedback } from '../utils/haptics';
import GlassIcon from './GlassIcon';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Biometric login states
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isBiometricModalOpen, setIsBiometricModalOpen] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'scanning' | 'verifying' | 'success' | 'failed'>('idle');
  const [selectedBiometricUser, setSelectedBiometricUser] = useState<User | null>(null);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  useEffect(() => {
    // Pre-fetch users for easy biometric selection
    const loadUsers = async () => {
      try {
        const users = await dbService.getUsers();
        // Filter active users to make sure we only allow active accounts
        const activeUsers = (users || []).filter(u => u.status === 'active');
        setAvailableUsers(activeUsers);
      } catch (e) {
        console.warn('Could not load users for biometrics', e);
      }
    };
    loadUsers();

    // Check if there is a previously typed or logged-in user to pre-select
    const lastUser = localStorage.getItem('mvp_last_logged_in_user_id');
    if (lastUser) {
      setUserId(lastUser);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerHapticFeedback('light');
    if (!userId.trim() || !password) {
      triggerHapticFeedback('error');
      setError('Please enter both User ID and Password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const enteredHash = await hashPassword(password);
      
      let authenticatedUser: User | null = null;
      let sessionToken: string | undefined = undefined;
      let customToken: string | undefined = undefined;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId.trim(), passwordHash: enteredHash }),
        });

        const data = await safeParseJsonResponse(res);
        if (res.ok && data.success) {
          authenticatedUser = data.user;
          sessionToken = data.sessionToken;
          customToken = data.customToken;
        } else {
          setError(data.error || 'Invalid User ID or Password.');
          setIsLoading(false);
          return;
        }
      } catch (netErr) {
        console.warn('Backend server is offline or unreachable. Falling back to local offline auth...', netErr);
        const localUser = await dbService.getUserByUserId(userId.trim());
        if (localUser && localUser.passwordHash === enteredHash) {
          if (localUser.status !== 'active') {
            setError('This account has been disabled. Please contact a Trustee.');
            setIsLoading(false);
            return;
          }
          authenticatedUser = localUser;
        } else {
          setError('Invalid User ID or Password.');
          setIsLoading(false);
          return;
        }
      }

      if (authenticatedUser) {
        if (sessionToken) {
          authenticatedUser.sessionToken = sessionToken;
        }

        const lastLoginAt = new Date().toISOString();
        authenticatedUser.lastLoginAt = lastLoginAt;
        try {
          await dbService.updateUser(authenticatedUser.id, { lastLoginAt });
        } catch (updateErr) {
          console.warn('Failed to update user lastLoginAt', updateErr);
        }
        
        // If we have a Firebase Custom Token, sign into Firebase Auth client-side!
        if (customToken) {
          try {
            const { signInWithCustomToken } = await import('firebase/auth');
            const { auth } = await import('../firebase');
            await signInWithCustomToken(auth, customToken);
            console.log('Successfully authenticated with Firebase Auth via Custom Token.');
          } catch (fbAuthErr) {
            console.error('Failed to sign in with Firebase Custom Token', fbAuthErr);
          }
        }

        // Save as last logged in user
        localStorage.setItem('mvp_last_logged_in_user_id', authenticatedUser.userId);

        // Success
        triggerHapticFeedback('success');
        onLoginSuccess(authenticatedUser);
      }
    } catch (err) {
      console.error('Login error', err);
      setError('An error occurred during login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Launch simulated biometric login
  const handleBiometricClick = async () => {
    setError(null);
    setBiometricError(null);
    setBiometricStatus('idle');

    // Determine which user to login
    let targetUser: User | null = null;
    const trimmedInput = userId.trim();

    if (trimmedInput) {
      targetUser = availableUsers.find(u => u.userId.toLowerCase() === trimmedInput.toLowerCase()) || null;
      if (!targetUser) {
        // Try fetching directly from db in case it's not pre-loaded
        try {
          targetUser = await dbService.getUserByUserId(trimmedInput);
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      // Check last logged in user ID
      const lastUser = localStorage.getItem('mvp_last_logged_in_user_id');
      if (lastUser) {
        targetUser = availableUsers.find(u => u.userId === lastUser) || null;
      }
    }

    // Open modal
    setSelectedBiometricUser(targetUser);
    setIsBiometricModalOpen(true);

    if (targetUser) {
      // Start scanning simulation automatically if we have a target user
      startBiometricScan(targetUser);
    }
  };

  const startBiometricScan = async (user: User) => {
    setSelectedBiometricUser(user);
    setBiometricStatus('scanning');
    setBiometricError(null);

    try {
      if (user.status !== 'active') {
        setBiometricStatus('failed');
        setBiometricError('This biometric profile is currently inactive or disabled.');
        return;
      }

      if (!user.biometricEnabled) {
        setBiometricStatus('failed');
        setBiometricError('Biometric sign-in is not registered for this account. Please sign in with your password and enable it in your Profile Settings.');
        return;
      }

      // Execute native browser WebAuthn biometric query verified on backend
      const result = await webAuthnService.authenticate(user.userId);
      
      if (result && result.sessionToken) {
        const lastLoginAt = new Date().toISOString();
        const authenticatedUser: User = {
          ...result.user,
          lastLoginAt,
          sessionToken: result.sessionToken
        };

        try {
          await dbService.updateUser(authenticatedUser.id, { lastLoginAt });
        } catch (updateErr) {
          console.warn('Failed to update user lastLoginAt', updateErr);
        }

        // If we have a Firebase Custom Token, sign into Firebase Auth client-side!
        if (result.customToken) {
          try {
            const { signInWithCustomToken } = await import('firebase/auth');
            const { auth } = await import('../firebase');
            await signInWithCustomToken(auth, result.customToken);
            console.log('Successfully authenticated with Firebase Auth via biometric Custom Token.');
          } catch (fbAuthErr) {
            console.error('Failed to sign in with Firebase Custom Token', fbAuthErr);
          }
        }

        setBiometricStatus('success');
        setTimeout(() => {
          setIsBiometricModalOpen(false);
          localStorage.setItem('mvp_last_logged_in_user_id', user.userId);
          onLoginSuccess(authenticatedUser);
        }, 1000);
      } else {
        setBiometricStatus('failed');
        setBiometricError('Biometric verification failed. Please try again.');
      }
    } catch (err: any) {
      console.error(err);
      setBiometricStatus('failed');
      setBiometricError(err.message || 'WebAuthn biometric scanning failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-0 flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-white selection:bg-yellow-400 selection:text-slate-900">
      {/* Soft metallic yellow ambient atmospheric glow accents on pure white background */}
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-yellow-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-24 w-88 h-88 bg-amber-100/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 left-1/3 w-96 h-96 bg-yellow-100/50 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        id="login-screen-container" 
        className="w-full max-w-sm sm:max-w-md relative z-10 mx-auto"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 140 }}
      >
        {/* Matte Frosted Glass Card Container */}
        <div 
          id="login-card" 
          className="relative bg-white/85 backdrop-blur-2xl border border-slate-200/90 rounded-[2.25rem] p-7 sm:p-9 shadow-[0_20px_50px_-12px_rgba(234,179,8,0.14),0_8px_24px_rgba(0,0,0,0.03)] overflow-hidden"
        >
          {/* Subtle Metallic Yellow Accent Line on top rim */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-300" />

          <div id="login-header" className="flex flex-col items-center mb-7">
            {/* App Logo in Matte Glass Frame with Metallic Yellow Border */}
            <div id="logo-image-wrapper" className="mb-4 relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-400 rounded-2xl blur-xs opacity-70" />
              <div className="relative w-16 h-16 rounded-2xl bg-white/95 backdrop-blur-xl border border-yellow-400/80 flex items-center justify-center shadow-md shadow-yellow-500/15 p-2 overflow-hidden">
                <img
                  src="/icon-192.png"
                  alt="MVP Ledger App Logo"
                  className="w-full h-full object-contain rounded-xl"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    const fallback = document.getElementById('logo-fallback-icon');
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div id="logo-fallback-icon" className="hidden w-full h-full items-center justify-center text-yellow-600">
                  <Shield className="h-8 w-8 text-yellow-600" />
                </div>
              </div>
            </div>

            <h2 id="login-title" className="text-2xl font-black text-slate-900 tracking-tight text-center">MVP Finance Portal</h2>
            <div className="mt-1.5 px-3 py-1 bg-yellow-100/70 backdrop-blur-md border border-yellow-300/80 rounded-full flex items-center gap-1.5 shadow-2xs">
              <Sparkles className="h-3 w-3 text-yellow-700" />
              <p id="login-subtitle" className="text-[10px] text-yellow-950 font-black tracking-wider uppercase text-center">Mission Vikram Prakalp</p>
            </div>
          </div>

          {error && (
            <div id="login-error" className="bg-rose-50/90 backdrop-blur-md text-rose-700 text-xs font-semibold p-3.5 rounded-2xl border border-rose-200/80 mb-6 shadow-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label htmlFor="userId" className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 ml-1">User ID</label>
              <input
                id="userId"
                type="text"
                autoComplete="username"
                placeholder="e.g. aarthik1"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full bg-slate-50/90 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3.5 focus:outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400 focus:bg-white text-slate-900 font-bold placeholder-slate-400/80 transition-all text-sm shadow-inner"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 ml-1">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50/90 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3.5 pr-12 focus:outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400 focus:bg-white text-slate-900 font-bold placeholder-slate-400/80 transition-all text-sm shadow-inner"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-xl cursor-pointer"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 space-y-2.5">
              {/* Metallic Yellow Primary Action Button (Zero orange) */}
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 hover:from-yellow-300 hover:via-amber-200 hover:to-yellow-400 active:scale-[0.99] text-slate-950 font-black py-3.5 px-4 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/25 text-sm border border-yellow-200/60"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 text-slate-950" />
                    <span>Sign In</span>
                  </>
                )}
              </button>

              {availableUsers.some(u => u.biometricEnabled) && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    handleBiometricClick();
                  }}
                  className="w-full bg-slate-50/80 hover:bg-white active:scale-[0.99] backdrop-blur-md border border-slate-200/90 text-slate-800 font-bold py-3 px-4 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs text-xs"
                >
                  <Fingerprint className="h-4 w-4 text-yellow-600" />
                  <span>Biometric Quick Sign-In</span>
                </button>
              )}
            </div>
          </form>

          <div id="login-footer" className="mt-7 border-t border-slate-200/80 pt-4 text-center">
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Secure Financial Ledger System</p>
          </div>
        </div>

      {/* BIOMETRIC SIMULATION MODAL - Matte Glass Finish */}
      {isBiometricModalOpen && (
        <div id="biometric-modal-overlay" className="fixed inset-0 bg-slate-950/30 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div id="biometric-modal-card" className="bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-3xl shadow-2xl max-w-sm w-full p-6 relative flex flex-col items-center text-center animate-in zoom-in-95 duration-250">
            <button 
              type="button"
              onClick={() => setIsBiometricModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-xl transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-4">
              <GlassIcon icon={Fingerprint} variant={
                biometricStatus === 'scanning' ? 'amber' :
                biometricStatus === 'verifying' ? 'indigo' :
                biometricStatus === 'success' ? 'emerald' :
                biometricStatus === 'failed' ? 'rose' : 'amber'
              } size="lg" className="shadow-md" />
            </div>

            <h3 className="text-base font-black text-slate-900 mb-1">
              {biometricStatus === 'idle' && 'Select Biometric Account'}
              {biometricStatus === 'scanning' && 'Scanning Biometric Sensor'}
              {biometricStatus === 'verifying' && 'Verifying Encrypted Profile'}
              {biometricStatus === 'success' && 'Authentication Confirmed'}
              {biometricStatus === 'failed' && 'Authentication Failed'}
            </h3>

            {selectedBiometricUser ? (
              <p className="text-xs text-slate-600 font-medium mb-4">
                User: <span className="text-slate-900 font-bold">{selectedBiometricUser.name}</span> ({selectedBiometricUser.role})
              </p>
            ) : (
              <p className="text-xs text-slate-600 font-medium mb-4">
                Please select an active profile configured on this device below:
              </p>
            )}

            {/* Error messaging */}
            {biometricError && (
              <div className="bg-rose-50 text-rose-700 text-xs font-semibold p-3.5 rounded-2xl border border-rose-200 flex items-center gap-2 mb-4 w-full justify-center">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                {biometricError}
              </div>
            )}

            {/* Body state renderers */}
            {biometricStatus === 'idle' && (
              <div className="w-full space-y-2 mb-4 max-h-[160px] overflow-y-auto pr-1">
                {availableUsers.filter(u => u.biometricEnabled).length > 0 ? (
                  availableUsers.filter(u => u.biometricEnabled).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => startBiometricScan(u)}
                      className="w-full bg-slate-50/90 hover:bg-white border border-slate-200/90 rounded-2xl p-3 flex items-center justify-between text-left cursor-pointer transition-colors shadow-xs"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-900">{u.name}</p>
                        <p className="text-[10px] text-yellow-800 font-extrabold uppercase tracking-wider">{u.role}</p>
                      </div>
                      <div className="bg-transparent border-0">
                        <GlassIcon icon={Fingerprint} variant="amber" size="sm" />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-4 text-center">
                    <p className="text-xs text-slate-800 font-extrabold mb-1">No Enrolled Biometrics Found</p>
                    <p className="text-[10px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                      Please sign in with your password, navigate to the <strong>Profile</strong> settings tab, and click <strong>Add Biometric to Sign-In</strong>.
                    </p>
                  </div>
                )}
              </div>
            )}

            {biometricStatus === 'scanning' && (
              <div className="w-full space-y-3 mb-2">
                <div className="h-1.5 w-32 bg-slate-100 rounded-full mx-auto overflow-hidden border border-slate-200">
                  <div className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full animate-progress" style={{ width: '60%' }} />
                </div>
                <p className="text-xs text-slate-600 font-medium animate-pulse">Place your registered finger on the sensor...</p>
              </div>
            )}

            {biometricStatus === 'verifying' && (
              <div className="w-full space-y-3 mb-2">
                <div className="h-1.5 w-32 bg-slate-100 rounded-full mx-auto overflow-hidden border border-slate-200">
                  <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full animate-pulse" style={{ width: '90%' }} />
                </div>
                <p className="text-xs text-yellow-700 font-bold">Querying secure enclave...</p>
              </div>
            )}

            {biometricStatus === 'success' && (
              <div className="w-full space-y-2 mb-2 flex flex-col items-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 animate-bounce" />
                <p className="text-xs text-emerald-700 font-extrabold flex items-center gap-1.5 justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-500 animate-spin" />
                  Access Granted. Welcome back!
                </p>
              </div>
            )}

            {biometricStatus === 'failed' && (
              <button
                type="button"
                onClick={() => {
                  if (selectedBiometricUser) {
                    startBiometricScan(selectedBiometricUser);
                  } else {
                    setBiometricStatus('idle');
                  }
                }}
                className="bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 text-slate-950 font-black py-2.5 px-4 rounded-xl transition-all cursor-pointer text-xs flex items-center justify-center gap-1.5 shadow-sm border border-yellow-300"
              >
                Try Again
              </button>
            )}

            {/* Prompt manual login */}
            {biometricStatus !== 'success' && (
              <button
                type="button"
                onClick={() => setIsBiometricModalOpen(false)}
                className="text-[10px] font-extrabold text-slate-400 hover:text-slate-700 uppercase tracking-wider mt-4 cursor-pointer transition-colors"
              >
                Use Password Instead
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
    </div>
  );
}
