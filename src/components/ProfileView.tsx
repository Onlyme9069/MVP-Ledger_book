import React, { useState, useEffect } from 'react';
import { User2, Lock, Save, Settings, ShieldAlert, CheckCircle2, Info, X, ChevronDown, ChevronUp, Fingerprint, Bell } from 'lucide-react';
import { User, Organization } from '../types';
import { dbService, hashPassword } from '../services/dbService';
import { webAuthnService } from '../services/webAuthn';

interface ProfileViewProps {
  currentUser: User;
  onUserUpdate: (updatedUser: User) => void;
}

export default function ProfileView({ currentUser, onUserUpdate }: ProfileViewProps) {
  // Version updates modal state
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
    }
  };

  const appReleases = [
    {
      version: 'v1.4.0 (Latest)',
      date: 'July 2026',
      changes: [
        'Added month-by-month resetting of transaction balances in the Analytics panel.',
        'Implemented continue-available-reserves across consecutive months via cumulative tracking.',
        'Added a beautiful bottom Calendar Selector in the Analytics view to inspect history.',
        'Integrated GSAP for ultra-smooth container animations and staggered slide-ups.',
        'Applied high-end glassmorphism styling to cards, forms, and tables.'
      ]
    },
    {
      version: 'v1.3.0',
      date: 'July 2026',
      changes: [
        'Added Notices Panel directly to the Trustees (Admins) dashboards.',
        'Integrated complete dispute monitoring and real-time transaction updates.',
        'Synchronized messenger triggers across roles.'
      ]
    },
    {
      version: 'v1.2.0',
      date: 'June 2026',
      changes: [
        'Added direct peer-to-peer secure private messaging.',
        'Implemented real-time public group chat.',
        'Added direct link triggers inside disputed records for quick responses.'
      ]
    },
    {
      version: 'v1.1.0',
      date: 'June 2026',
      changes: [
        'Added Cash, UPI, and Other transaction categorizations.',
        'Implemented dynamic daily flow trends charts and pie charts.',
        'Added monthly and yearly organization-wide budget limit trackers.'
      ]
    },
    {
      version: 'v1.0.0',
      date: 'May 2026',
      changes: [
        'Initial MVP Ledger release.',
        'Role-based dashboard systems (Trustees, Managers, and Aarthik Pramukhs).',
        'Secure multi-user authentication system.'
      ]
    }
  ];

  // Profile update states
  const [profileName, setProfileName] = useState(currentUser.name);
  const [profileUserId, setProfileUserId] = useState(currentUser.userId);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Collapsible cards state
  const [isProfileExpanded, setIsProfileExpanded] = useState(true);
  const [isPasswordExpanded, setIsPasswordExpanded] = useState(true);
  const [isBiometricExpanded, setIsBiometricExpanded] = useState(true);

  // Biometric registration states
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<'idle' | 'scanning' | 'success'>('idle');
  const [registerError, setRegisterError] = useState<string | null>(null);

  const startBiometricRegistration = async () => {
    setIsRegisterModalOpen(true);
    setRegisterStatus('scanning');
    setRegisterError(null);

    try {
      let token = currentUser.sessionToken || '';
      let pHash = currentUser.passwordHash || '';

      // Fallback for default sandbox accounts if password hash is missing in state
      if (!pHash) {
        if (currentUser.userId === 'superadmin' || currentUser.userId === 'admin') {
          pHash = await hashPassword('admin123');
        } else if (currentUser.userId === 'aarthik1') {
          pHash = await hashPassword('aarthik123');
        }
      }
      
      // Silently acquire a session token if it is missing and we have local credentials
      if (!token && currentUser.userId && pHash) {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.userId, passwordHash: pHash }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.sessionToken) {
              token = data.sessionToken;
              onUserUpdate({
                ...currentUser,
                passwordHash: pHash,
                sessionToken: token,
              });
            }
          }
        } catch (silentErr) {
          console.warn('Failed to silently refresh session token on registration start', silentErr);
        }
      }

      if (!token) {
        throw new Error('No active secure session found. Please sign out and sign in again with your password.');
      }

      // Invoke server-verified WebAuthn registration
      let success = false;
      try {
        success = await webAuthnService.register(token);
      } catch (regErr: any) {
        const errorMsg = regErr.message || '';
        const isSessionError = errorMsg.includes('expired') || 
                             errorMsg.includes('invalid') || 
                             errorMsg.includes('Authentication') || 
                             errorMsg.includes('session') ||
                             errorMsg.includes('sign in');
        
        // If it looks like a session issue, try to silently refresh and retry once
        if (isSessionError && currentUser.userId && pHash) {
          console.log('Session token expired or invalid. Attempting silent session refresh and retry...');
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.userId, passwordHash: pHash }),
            });
            if (res.ok) {
              const data = await res.json();
              const newToken = data.sessionToken;
              if (newToken) {
                token = newToken;
                onUserUpdate({
                  ...currentUser,
                  passwordHash: pHash,
                  sessionToken: newToken,
                });
                success = await webAuthnService.register(newToken);
              } else {
                throw regErr;
              }
            } else {
              throw regErr;
            }
          } catch (retryErr: any) {
            throw retryErr;
          }
        } else {
          throw regErr;
        }
      }
      
      if (success) {
        // Update parent React state
        onUserUpdate({ 
          ...currentUser, 
          passwordHash: pHash || currentUser.passwordHash,
          biometricEnabled: true,
          sessionToken: token,
        });
        setRegisterStatus('success');
      } else {
        throw new Error('Biometric registration was not confirmed by the server.');
      }
    } catch (err: any) {
      console.error('Error enabling biometric', err);
      setRegisterError(err.message || 'Failed to register biometric credentials. Please try again.');
      setRegisterStatus('idle');
    }
  };

  const removeBiometricSetup = async () => {
    try {
      let token = currentUser.sessionToken || '';
      let pHash = currentUser.passwordHash || '';

      // Fallback for default sandbox accounts if password hash is missing in state
      if (!pHash) {
        if (currentUser.userId === 'superadmin' || currentUser.userId === 'admin') {
          pHash = await hashPassword('admin123');
        } else if (currentUser.userId === 'aarthik1') {
          pHash = await hashPassword('aarthik123');
        }
      }
      
      // Silently acquire a session token if it is missing and we have local credentials
      if (!token && currentUser.userId && pHash) {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.userId, passwordHash: pHash }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.sessionToken) {
              token = data.sessionToken;
              onUserUpdate({
                ...currentUser,
                passwordHash: pHash,
                sessionToken: token,
              });
            }
          }
        } catch (silentErr) {
          console.warn('Failed to silently refresh session token on revocation start', silentErr);
        }
      }

      if (!token) {
        throw new Error('No active secure session found.');
      }

      let success = false;
      try {
        success = await webAuthnService.revoke(token);
      } catch (revErr: any) {
        const errorMsg = revErr.message || '';
        const isSessionError = errorMsg.includes('expired') || 
                             errorMsg.includes('invalid') || 
                             errorMsg.includes('Authentication') || 
                             errorMsg.includes('session') ||
                             errorMsg.includes('sign in');

        // If it looks like a session issue, try to silently refresh and retry once
        if (isSessionError && currentUser.userId && pHash) {
          console.log('Session token expired or invalid during revocation. Attempting silent refresh and retry...');
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.userId, passwordHash: pHash }),
            });
            if (res.ok) {
              const data = await res.json();
              const newToken = data.sessionToken;
              if (newToken) {
                token = newToken;
                onUserUpdate({
                  ...currentUser,
                  passwordHash: pHash,
                  sessionToken: newToken,
                });
                success = await webAuthnService.revoke(newToken);
              } else {
                throw revErr;
              }
            } else {
              throw revErr;
            }
          } catch (retryErr: any) {
            throw retryErr;
          }
        } else {
          throw revErr;
        }
      }

      if (success) {
        onUserUpdate({ 
          ...currentUser, 
          passwordHash: pHash || currentUser.passwordHash,
          biometricEnabled: false,
          sessionToken: token,
        });
      }
    } catch (err) {
      console.error('Error removing biometric', err);
    }
  };

  useEffect(() => {
    setProfileName(currentUser.name);
    setProfileUserId(currentUser.userId);
  }, [currentUser]);

  // Password change form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Org settings states (Available for display/edit depending on role)
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgName, setOrgName] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [yearlyBudget, setYearlyBudget] = useState('');
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSuccess, setOrgSuccess] = useState<string | null>(null);
  const [isSavingOrg, setIsSavingOrg] = useState(false);

  useEffect(() => {
    // Fetch organization info for all roles
    dbService.getOrganization()
      .then(org => {
        setOrganization(org);
        setOrgName(org.organizationName);
        setMonthlyBudget(org.monthlyBudget !== undefined && org.monthlyBudget !== null ? org.monthlyBudget.toString() : '');
        setYearlyBudget(org.yearlyBudget !== undefined && org.yearlyBudget !== null ? org.yearlyBudget.toString() : '');
      })
      .catch(err => console.error('Error fetching org info', err));
  }, [currentUser]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill out all fields.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setIsChangingPassword(true);

    try {
      // Validate current password hash
      const currentHash = await hashPassword(currentPassword);
      if (currentHash !== currentUser.passwordHash) {
        setPasswordError('Incorrect current password.');
        setIsChangingPassword(false);
        return;
      }

      // Hash new password and update in DB
      const newHash = await hashPassword(newPassword);
      await dbService.updateUser(currentUser.id, { passwordHash: newHash });

      // Update current user state
      const updatedUser = { ...currentUser, passwordHash: newHash };
      onUserUpdate(updatedUser);

      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password successfully updated!');
    } catch (err) {
      console.error('Password change error', err);
      setPasswordError('Failed to change password. Please try again.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const cleanUserId = profileUserId.trim().toLowerCase().replace(/\s/g, '');
    const cleanName = profileName.trim();

    if (!cleanUserId || !cleanName) {
      setProfileError('Name and Username/User ID cannot be empty.');
      return;
    }

    setIsSavingProfile(true);

    try {
      // If user is changing their Username (User ID), verify uniqueness in DB
      if (cleanUserId !== currentUser.userId) {
        const existing = await dbService.getUserByUserId(cleanUserId);
        if (existing) {
          setProfileError(`Username "${cleanUserId}" is already in use.`);
          setIsSavingProfile(false);
          return;
        }
      }

      const updates = {
        name: cleanName,
        userId: cleanUserId
      };

      await dbService.updateUser(currentUser.id, updates);

      // Trigger user updates
      const updatedUser = { ...currentUser, ...updates };
      onUserUpdate(updatedUser);

      setProfileSuccess('Profile details successfully updated!');
    } catch (err) {
      console.error('Profile update error', err);
      setProfileError('Failed to update profile details.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleOrgSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgError(null);
    setOrgSuccess(null);

    if (!orgName.trim()) {
      setOrgError('Organization name cannot be empty.');
      return;
    }

    const parsedMonthly = monthlyBudget.trim() ? parseFloat(monthlyBudget) : 0;
    const parsedYearly = yearlyBudget.trim() ? parseFloat(yearlyBudget) : 0;

    if (isNaN(parsedMonthly) || parsedMonthly < 0) {
      setOrgError('Monthly budget must be a positive number.');
      return;
    }

    if (isNaN(parsedYearly) || parsedYearly < 0) {
      setOrgError('Yearly budget must be a positive number.');
      return;
    }

    setIsSavingOrg(true);

    try {
      const updates: Partial<Organization> = {
        organizationName: orgName.trim(),
        monthlyBudget: parsedMonthly,
        yearlyBudget: parsedYearly,
        budgetUpdatedBy: currentUser.name,
        budgetUpdatedAt: new Date().toISOString()
      };
      await dbService.updateOrganization(updates);
      setOrganization(prev => prev ? { ...prev, ...updates } : null);
      setOrgSuccess('System and budget configurations successfully updated!');
    } catch (err) {
      console.error('Org save error', err);
      setOrgError('Failed to update organization details.');
    } finally {
      setIsSavingOrg(false);
    }
  };

  return (
    <div id="profile-container" className="space-y-6 max-w-4xl mx-auto">
      {/* Title with Info Badge */}
      <div className="flex items-center justify-between bg-white border border-gray-100 p-4 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2">
          <User2 className="h-5 w-5 text-gray-700" />
          <h2 id="profile-title" className="text-base font-black text-gray-900 tracking-tight">Profile & Account Settings</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* LEFT COLUMN: PROFILE CARD & PUSH NOTIFICATIONS */}
        <div className="space-y-6 h-fit">
          {/* PROFILE CARD */}
          <div id="profile-details-card" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4 h-fit">
            <div className="flex flex-col items-center text-center pb-4 border-b border-gray-50">
              <div className="bg-gray-50 border border-gray-100 text-gray-700 p-4 rounded-full mb-3">
                <User2 className="h-10 w-10 text-gray-600" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">{currentUser.name}</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">
                {currentUser.role === 'Super Admin' || currentUser.role === 'Admin' ? 'Trustee' : currentUser.role}
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">User ID</p>
                <p className="text-gray-800 font-medium mt-0.5">{currentUser.userId}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Account ID</p>
                <p className="text-gray-500 font-mono text-[10px] mt-0.5">{currentUser.id}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Access Status</p>
                <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full mt-1">
                  Active System User
                </span>
              </div>
            </div>
          </div>

          {/* PUSH NOTIFICATIONS SETTINGS */}
          <div id="profile-notifications-card" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
              <Bell className="h-4 w-4 text-amber-500 shrink-0" />
              Push Notifications
            </h3>
            <div className="space-y-3.5 text-xs">
              <p className="text-gray-500 leading-relaxed text-[11px]">
                Receive instant browser alerts whenever a ledger dispute is raised or a teammate sends you a direct message.
              </p>
              
              {/* Status Indicator */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</span>
                <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                  notificationPermission === 'granted' 
                    ? 'bg-emerald-50 text-emerald-700' 
                    : notificationPermission === 'denied'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-700'
                }`}>
                  {notificationPermission === 'granted' ? 'Enabled' : notificationPermission === 'denied' ? 'Blocked' : 'Default'}
                </span>
              </div>

              {notificationPermission === 'granted' ? (
                <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl flex items-center gap-2 text-emerald-800 font-medium text-[11px]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Real-time push alerts are successfully enabled in this browser.</span>
                </div>
              ) : notificationPermission === 'denied' ? (
                <div className="bg-red-50/50 border border-red-100 p-3 rounded-xl space-y-1 text-red-800">
                  <div className="flex items-center gap-1.5 font-bold text-[11px]">
                    <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                    <span>Notifications Blocked</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-red-700 font-medium">
                    Browser notifications are blocked. Click the lock icon next to your browser URL bar to reset permissions.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-gray-950 font-black uppercase tracking-wider py-2.5 rounded-xl cursor-pointer shadow-xs transition-colors flex items-center justify-center gap-2 text-[10px]"
                >
                  <Bell className="h-3.5 w-3.5 shrink-0" />
                  Enable Push Alerts
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CHANGE PASSWORD & ORGANIZATIONS CARD */}
        <div className="md:col-span-2 space-y-6">
          {/* Update Profile Details */}
          <div id="profile-details-edit-card" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
            <button 
              type="button"
              onClick={() => setIsProfileExpanded(!isProfileExpanded)}
              className={`w-full text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center justify-between pb-2.5 focus:outline-none cursor-pointer group ${
                isProfileExpanded ? 'border-b border-gray-50' : ''
              }`}
            >
              <span className="flex items-center gap-1.5 group-hover:text-gray-900 transition-colors">
                <User2 className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
                Update Profile Details
              </span>
              {isProfileExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
              )}
            </button>

            {isProfileExpanded && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {profileError && (
                  <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    {profileError}
                  </div>
                )}

                {profileSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 text-xs font-semibold p-3.5 rounded-xl border border-emerald-100 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {profileSuccess}
                  </div>
                )}

                <form onSubmit={handleProfileSave} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-medium text-gray-800"
                        placeholder="Enter full name"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Username / User ID</label>
                      <input
                        type="text"
                        value={profileUserId}
                        onChange={(e) => setProfileUserId(e.target.value.toLowerCase().replace(/\s/g, ''))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-medium text-gray-800"
                        placeholder="Enter unique username"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 text-xs shadow-xs"
                  >
                    <Save className="h-4 w-4" />
                    {isSavingProfile ? 'Saving Details...' : 'Save Details'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Change Password */}
          <div id="password-card" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
            <button 
              type="button"
              onClick={() => setIsPasswordExpanded(!isPasswordExpanded)}
              className={`w-full text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center justify-between pb-2.5 focus:outline-none cursor-pointer group ${
                isPasswordExpanded ? 'border-b border-gray-50' : ''
              }`}
            >
              <span className="flex items-center gap-1.5 group-hover:text-gray-900 transition-colors">
                <Lock className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
                Update Account Password
              </span>
              {isPasswordExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
              )}
            </button>

            {isPasswordExpanded && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {passwordError && (
                  <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="bg-emerald-50 text-emerald-600 text-xs font-semibold p-3.5 rounded-xl border border-emerald-100 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {passwordSuccess}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300"
                      placeholder="Enter current password"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300"
                        placeholder="Min 6 characters"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300"
                        placeholder="Repeat new password"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 text-xs shadow-xs"
                  >
                    <Save className="h-4 w-4" />
                    {isChangingPassword ? 'Saving Password...' : 'Save Password'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Biometric Sign-In */}
          <div id="biometric-card" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
            <button
              type="button"
              onClick={() => setIsBiometricExpanded(!isBiometricExpanded)}
              className={`w-full text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center justify-between pb-2.5 focus:outline-none cursor-pointer group ${
                isBiometricExpanded ? 'border-b border-gray-50' : ''
              }`}
            >
              <span className="flex items-center gap-1.5 group-hover:text-gray-900 transition-colors">
                <Fingerprint className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
                Biometric Sign-In
              </span>
              {isBiometricExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
              )}
            </button>

            {isBiometricExpanded && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {registerError && (
                  <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    {registerError}
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  {currentUser.biometricEnabled
                    ? 'Biometric sign-in is enabled for this account. You can use it on the login screen for quick access.'
                    : 'Enable biometric sign-in to quickly access your account using your device fingerprint or face unlock, without typing a password.'}
                </p>

                {currentUser.biometricEnabled ? (
                  <button
                    type="button"
                    onClick={removeBiometricSetup}
                    className="bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 px-5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 text-xs border border-red-100"
                  >
                    <X className="h-4 w-4" />
                    Remove Biometric Sign-In
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startBiometricRegistration}
                    className="bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 text-xs shadow-xs"
                  >
                    <Fingerprint className="h-4 w-4" />
                    Add Biometric to Sign-In
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Org Settings for Admins */}
          {(currentUser.role === 'Super Admin' || currentUser.role === 'Admin') && (
            <div id="org-settings-card" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
                <Settings className="h-4 w-4 text-gray-500" />
                System & Budget Configurations (Trustee ONLY)
              </h3>

              {orgError && (
                <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100">
                  {orgError}
                </div>
              )}

              {orgSuccess && (
                <div className="bg-emerald-50 text-emerald-600 text-xs font-semibold p-3.5 rounded-xl border border-emerald-100">
                  {orgSuccess}
                </div>
              )}

              <form onSubmit={handleOrgSave} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Organization Name</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-bold text-gray-800"
                    placeholder="MVP-Ledger"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Monthly Budget Limit (INR)
                    </label>
                    <input
                      type="number"
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-bold text-gray-800"
                      placeholder="e.g. 50000 (0 or blank to disable)"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Yearly Budget Limit (INR)
                    </label>
                    <input
                      type="number"
                      value={yearlyBudget}
                      onChange={(e) => setYearlyBudget(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-bold text-gray-800"
                      placeholder="e.g. 500000 (0 or blank to disable)"
                      min="0"
                    />
                  </div>
                </div>

                {organization?.budgetUpdatedBy && (
                  <p className="text-[9px] text-gray-400 italic">
                    Last budget update by {organization.budgetUpdatedBy} on {new Date(organization.budgetUpdatedAt || '').toLocaleString()}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSavingOrg}
                  className="bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 text-xs shadow-xs"
                >
                  <Save className="h-4 w-4" />
                  {isSavingOrg ? 'Saving Details...' : 'Save Configuration'}
                </button>
              </form>
            </div>
          )}

          {/* Read-Only Budget View for Finance Manager / Aarthik Pramukh / Viewer */}
          {(currentUser.role === 'Finance Manager' || currentUser.role === 'Aarthik Pramukh' || currentUser.role === 'Viewer') && (
            <div id="read-only-budget-card" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
                <Settings className="h-4 w-4 text-gray-500" />
                Organization Budgets
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100/50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Monthly Budget Limit</p>
                  <p className="text-sm font-black text-gray-900">
                    {organization?.monthlyBudget ? `₹${organization.monthlyBudget.toLocaleString('en-IN')}` : 'Not Configured'}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100/50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Yearly Budget Limit</p>
                  <p className="text-sm font-black text-gray-900">
                    {organization?.yearlyBudget ? `₹${organization.yearlyBudget.toLocaleString('en-IN')}` : 'Not Configured'}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 italic">
                Note: Budget limits are read-only for your account. Please contact a Trustee to request updates.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* VERSION INFO GLASSY OVERLAY MODAL */}
      {isVersionModalOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 z-50 animate-in fade-in duration-200"
            onClick={() => setIsVersionModalOpen(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-gray-150 rounded-2xl shadow-2xl p-6 z-50 w-[92%] max-w-md max-h-[80vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-250">
            <div className="flex items-center justify-between border-b border-gray-150 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-gray-100 p-1.5 rounded-lg border border-gray-200/50">
                  <Info className="h-4 w-4 text-gray-700" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900">App Version History</h3>
                  <p className="text-[10px] text-gray-500 font-bold">Monitor every latest update</p>
                </div>
              </div>
              <button 
                onClick={() => setIsVersionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="space-y-5 flex-1 pr-1">
              {appReleases.map((release) => (
                <div key={release.version} className="border-l-2 border-gray-950 pl-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200/40">
                      {release.version}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {release.date}
                    </span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-gray-600 font-medium leading-relaxed">
                    {release.changes.map((change, idx) => (
                      <li key={idx} className="marker:text-gray-400">
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-150 pt-4 mt-5 flex justify-end">
              <button
                onClick={() => setIsVersionModalOpen(false)}
                className="bg-gray-950 hover:bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer shadow-xs"
              >
                Close Logs
              </button>
            </div>
          </div>
        </>
      )}

      {/* BIOMETRIC REGISTRATION SIMULATOR MODAL */}
      {isRegisterModalOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 z-50 animate-in fade-in duration-200"
            onClick={() => {
              if (registerStatus !== 'scanning') {
                setIsRegisterModalOpen(false);
              }
            }}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-gray-150 rounded-2xl shadow-2xl p-6 z-50 w-[92%] max-w-sm flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-250">
            <button 
              type="button"
              disabled={registerStatus === 'scanning'}
              onClick={() => setIsRegisterModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-4 bg-gray-50 p-4 rounded-full border border-gray-100 mt-2">
              <Fingerprint className={`h-12 w-12 transition-all duration-300 ${
                registerStatus === 'scanning' ? 'animate-pulse text-gray-600 scale-110' :
                registerStatus === 'success' ? 'text-emerald-600 scale-115' : 'text-gray-400'
              }`} />
            </div>

            <h3 className="text-sm font-extrabold text-gray-900 mb-1">
              {registerStatus === 'scanning' ? 'Scanning Fingerprint' : 'Biometric Setup Complete'}
            </h3>

            <p className="text-xs text-gray-500 font-medium mb-4 max-w-xs">
              {registerStatus === 'scanning' 
                ? 'Place your finger on the device sensor to register your biometric profile credentials locally.' 
                : 'Your biometric credential token has been securely enrolled in the system database linked to this user profile.'
              }
            </p>

            {registerError && (
              <div className="bg-red-50 text-red-600 text-[11px] font-semibold p-3 rounded-xl border border-red-100 mb-4 w-full">
                {registerError}
              </div>
            )}

            {registerStatus === 'scanning' && (
              <div className="w-full space-y-2.5">
                <div className="h-1.5 w-32 bg-gray-100 rounded-full mx-auto overflow-hidden border border-gray-200/50">
                  <div className="h-full bg-gray-900 rounded-full animate-progress" style={{ width: '45%' }} />
                </div>
                <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider animate-pulse">
                  Sensor Active...
                </p>
              </div>
            )}

            {registerStatus === 'success' && (
              <div className="w-full space-y-4">
                <div className="bg-emerald-50 text-emerald-700 text-xs font-bold py-2 px-3 rounded-xl border border-emerald-100 inline-flex items-center gap-1.5 justify-center w-full">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Successfully Linked!
                </div>
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="w-full bg-gray-950 hover:bg-gray-800 text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer shadow-xs transition-colors"
                >
                  Close Setup
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
