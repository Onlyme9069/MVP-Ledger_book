import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  TrendingUp, 
  Search, 
  Calendar, 
  ArrowDownLeft, 
  ArrowUpRight,
  User,
  Users as UsersIcon,
  UserPlus,
  AlertTriangle,
  Shield,
  Trash2,
  Edit
} from 'lucide-react';
import GlassIcon from './GlassIcon';
import { User as UserType, TransactionRecord, ActiveTab, UserRole } from '../types';
import { dbService, hashPassword } from '../services/dbService';
import AnalyticsView from './AnalyticsView';
import ProfileView from './ProfileView';
import NoticesPanel from './NoticesPanel';
import DisputeModal from './DisputeModal';
import RecordDetailsModal from './RecordDetailsModal';
import ChatWidget from './ChatWidget';
import GoogleSheetsSyncModal from './GoogleSheetsSyncModal';
import HeaderSidebar from './HeaderSidebar';

interface AdminDashboardProps {
  currentUser: UserType;
  records: TransactionRecord[];
  onRefreshRecords: () => void;
  onLogout: () => void;
  onUserUpdate: (updatedUser: UserType) => void;
}

export default function AdminDashboard({
  currentUser,
  records,
  onRefreshRecords,
  onLogout,
  onUserUpdate
}: AdminDashboardProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);

  // Users Management states
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    userId: '',
    name: '',
    password: '',
    role: 'Finance Manager' as 'Admin' | 'Finance Manager' | 'Viewer'
  });
  const [userSuccessMessage, setUserSuccessMessage] = useState<string | null>(null);
  const [userErrorMessage, setUserErrorMessage] = useState<string | null>(null);

  // Edit User states
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    userId: '',
    name: '',
    password: '',
    role: 'Finance Manager' as UserRole,
    status: 'active' as 'active' | 'disabled'
  });
  const [editUserSuccessMessage, setEditUserSuccessMessage] = useState<string | null>(null);
  const [editUserErrorMessage, setEditUserErrorMessage] = useState<string | null>(null);

  // Delete Confirmation & Directory Action states
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserType | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  // Record Inspector state
  const [searchQuery, setSearchQuery] = useState('');
  const [natureFilter, setNatureFilter] = useState<'All' | 'Income' | 'Expense'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Cash' | 'UPI' | 'Other'>('All');
  const [selectedRecord, setSelectedRecord] = useState<TransactionRecord | null>(null);

  // Card Dispute states
  const [disputingRecord, setDisputingRecord] = useState<TransactionRecord | null>(null);

  // Fetch all users on mount / refresh
  const fetchUsers = async () => {
    setIsUsersLoading(true);
    try {
      const users = await dbService.getUsers();
      setAllUsers(users);
    } catch (err) {
      console.error('Error fetching users', err);
    } finally {
      setIsUsersLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const handleOpenChat = () => {
      setIsChatOpen(true);
    };
    const handleOpenNotices = () => {
      setActiveTab('notices');
    };

    window.addEventListener('app:open-chat', handleOpenChat);
    window.addEventListener('app:open-notices', handleOpenNotices);

    return () => {
      window.removeEventListener('app:open-chat', handleOpenChat);
      window.removeEventListener('app:open-notices', handleOpenNotices);
    };
  }, []);

  // Track unread notices state
  const [hasUnreadNotices, setHasUnreadNotices] = useState(false);

  // Clear unread notices when opening the notices tab
  useEffect(() => {
    if (activeTab === 'notices') {
      setHasUnreadNotices(false);
      localStorage.setItem(`lastViewedNoticesTime_${currentUser.userId}`, new Date().toISOString());
    }
  }, [activeTab, currentUser.userId]);

  // Check for unread notices periodically
  useEffect(() => {
    const checkUnreadNotices = async () => {
      if (activeTab === 'notices') {
        setHasUnreadNotices(false);
        return;
      }

      try {
        const allNotices = await dbService.getNotices();
        if (!allNotices || allNotices.length === 0) {
          setHasUnreadNotices(false);
          return;
        }

        const lastViewed = localStorage.getItem(`lastViewedNoticesTime_${currentUser.userId}`);
        if (!lastViewed) {
          // If never viewed, check if there are any active reported notices by others
          const hasReportedByOthers = allNotices.some(
            n => n.reportedBy !== currentUser.userId && n.status === 'reported'
          );
          setHasUnreadNotices(hasReportedByOthers);
        } else {
          const lastViewedTime = new Date(lastViewed).getTime();
          const hasNewReportedByOthers = allNotices.some(
            n => n.reportedBy !== currentUser.userId && n.status === 'reported' && new Date(n.createdAt).getTime() > lastViewedTime
          );
          setHasUnreadNotices(hasNewReportedByOthers);
        }
      } catch (err) {
        console.error('Error checking unread notices:', err);
      }
    };

    checkUnreadNotices();
    const interval = setInterval(checkUnreadNotices, 5000);
    return () => clearInterval(interval);
  }, [activeTab, currentUser.userId]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserSuccessMessage(null);
    setUserErrorMessage(null);

    const { userId, name, password, role } = newUserForm;
    if (!userId.trim() || !name.trim() || !password) {
      setUserErrorMessage('Please fill out all user fields.');
      return;
    }

    if (password.length < 6) {
      setUserErrorMessage('Password must be at least 6 characters.');
      return;
    }

    // Role safety checks: Admin cannot create another Admin
    if (currentUser.role === 'Admin' && role === 'Admin') {
      setUserErrorMessage('As a Trustee, you do not have permission to provision Trustee accounts.');
      return;
    }

    try {
      // Check if userId already exists
      const existing = await dbService.getUserByUserId(userId.trim());
      if (existing) {
        setUserErrorMessage(`User ID "${userId.trim()}" is already in use.`);
        return;
      }

      const passHash = await hashPassword(password);
      const newUser: UserType = {
        id: `user_${Date.now()}`,
        userId: userId.trim(),
        name: name.trim(),
        passwordHash: passHash,
        role: role,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await dbService.createUser(newUser);
      
      setUserSuccessMessage(`Successfully provisioned account for ${name.trim()} (${role})!`);
      setNewUserForm({
        userId: '',
        name: '',
        password: '',
        role: 'Finance Manager'
      });
      fetchUsers();
    } catch (err) {
      console.error('Error creating user', err);
      setUserErrorMessage('Failed to create user. Please try again.');
    }
  };

  const handleOpenEditUser = (user: UserType) => {
    setEditingUser(user);
    setEditUserForm({
      userId: user.userId,
      name: user.name,
      password: '',
      role: user.role,
      status: user.status
    });
    setEditUserSuccessMessage(null);
    setEditUserErrorMessage(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setEditUserSuccessMessage(null);
    setEditUserErrorMessage(null);

    const { userId, name, password, role, status } = editUserForm;
    const cleanUserId = userId.trim().toLowerCase().replace(/\s/g, '');

    if (!cleanUserId || !name.trim()) {
      setEditUserErrorMessage('Please fill out all user fields.');
      return;
    }

    // Role safety checks: Admin cannot grant Admin/Super Admin roles
    if (currentUser.role === 'Admin' && (role === 'Admin' || role === 'Super Admin')) {
      setEditUserErrorMessage('As a Trustee, you do not have permission to provision Trustee roles.');
      return;
    }

    try {
      // Check if userId already in use by another user
      if (cleanUserId !== editingUser.userId) {
        const existing = await dbService.getUserByUserId(cleanUserId);
        if (existing) {
          setEditUserErrorMessage(`User ID "${cleanUserId}" is already in use.`);
          return;
        }
      }

      const updates: Partial<UserType> = {
        userId: cleanUserId,
        name: name.trim(),
        role: role,
        status: status
      };

      if (password) {
        if (password.length < 6) {
          setEditUserErrorMessage('Password must be at least 6 characters.');
          return;
        }
        updates.passwordHash = await hashPassword(password);
      }

      await dbService.updateUser(editingUser.id, updates);

      // If updating currently logged in user, propagate state
      if (editingUser.id === currentUser.id) {
        const updatedUser = {
          ...currentUser,
          ...updates
        };
        if (password) {
          updatedUser.passwordHash = updates.passwordHash!;
        }
        onUserUpdate(updatedUser);
      }

      setEditUserSuccessMessage(`Successfully updated ${name.trim()}'s profile!`);
      fetchUsers();

      setTimeout(() => {
        setEditingUser(null);
      }, 1000);
    } catch (err) {
      console.error('Error updating user', err);
      setEditUserErrorMessage('Failed to update user. Please try again.');
    }
  };

  const handleToggleUserStatus = async (user: UserType) => {
    setDirectoryError(null);
    // Role safety checks: Admin cannot modify another Admin/Super Admin
    if (currentUser.role === 'Admin' && (user.role === 'Admin' || user.role === 'Super Admin')) {
      setDirectoryError('You do not have permission to disable Trustee accounts.');
      return;
    }

    if (user.id === currentUser.id) {
      setDirectoryError('You cannot disable your own active account.');
      return;
    }

    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      await dbService.updateUser(user.id, { status: nextStatus });
      fetchUsers();
    } catch (err) {
      console.error('Error updating user status', err);
      setDirectoryError('Failed to update user status.');
    }
  };

  const initiateDeleteUser = (user: UserType) => {
    setDirectoryError(null);
    // Role safety checks: Admin cannot delete another Admin/Super Admin
    if (currentUser.role === 'Admin' && (user.role === 'Admin' || user.role === 'Super Admin')) {
      setDirectoryError('You do not have permission to delete Trustee accounts.');
      return;
    }

    if (user.id === currentUser.id) {
      setDirectoryError('You cannot delete your own account.');
      return;
    }

    // Only allow Super Admin to delete other Super Admins
    if (user.role === 'Super Admin' && currentUser.role !== 'Super Admin') {
      setDirectoryError('Only a Trustee can delete other Trustee accounts.');
      return;
    }

    setDeleteConfirmUser(user);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    try {
      await dbService.deleteUser(deleteConfirmUser.id);
      fetchUsers();
      setDeleteConfirmUser(null);
    } catch (err) {
      console.error('Error deleting user', err);
      setDirectoryError('Failed to delete user account.');
    }
  };

  // Records filters memoized for smooth response & fast render
  const filteredRecords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return records.filter(r => {
      if (r.status !== 'active') return false;

      const matchesSearch = !q ||
        r.purpose.toLowerCase().includes(q) ||
        r.moneySender.toLowerCase().includes(q) ||
        r.moneyReceiver.toLowerCase().includes(q) ||
        (r.notes && r.notes.toLowerCase().includes(q));

      const matchesNature = natureFilter === 'All' || r.transactionNature === natureFilter;
      const matchesType = typeFilter === 'All' || r.transactionType === typeFilter;

      return matchesSearch && matchesNature && matchesType;
    });
  }, [records, searchQuery, natureFilter, typeFilter]);

  const totalFilteredSum = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + r.amount, 0);
  }, [filteredRecords]);

  return (
    <div id="admin-dashboard-root" className="min-h-screen bg-gray-50 flex flex-col justify-between">
      
      {/* HEADER CONTROLS */}
      <header className="glass-card !fixed top-0 left-0 right-0 z-40 py-1.5 px-4 shadow-sm border-b border-white/30 bg-white/45 backdrop-blur-md !w-full !h-auto !rounded-none">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GlassIcon icon={Shield} variant="indigo" size="sm" className="shadow-sm" />
            <div>
              <h1 className="text-sm font-bold text-gray-950 tracking-tight">Mission Vikram Prakalp</h1>
              <p className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider">
                {(currentUser.role === 'Super Admin' || currentUser.role === 'Admin') ? 'Trustee' : currentUser.role} Control Panel
              </p>
            </div>
          </div>
          <HeaderSidebar
            currentUser={currentUser}
            onOpenSheets={() => setIsSheetsModalOpen(true)}
            onOpenChat={() => setIsChatOpen(true)}
            onLogout={onLogout}
          />
        </div>
      </header>

      {/* Spacer to push content down below fixed header */}
      <div className="h-[48px] w-full shrink-0" />

      {/* STAGE MAIN */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className="w-full"
          >
            {activeTab === 'home' ? (
              /* ==================== HOME PANEL ==================== */
              <div className="space-y-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-gray-950 tracking-tight">Financial Ledger Audit</h2>
              <p className="text-xs text-gray-500">View and inspect live transaction records entered by your Finance Managers.</p>
            </div>

            {/* LEDGER ENTRIES CONTAINER */}
            <div className="max-w-3xl mx-auto w-full space-y-4">
              
              {/* SEARCH & FILTERS CONTROLS */}
              <div className="glass-card p-4 rounded-2xl space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search transactions (purpose, sender, receiver...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-800"
                  />
                </div>

                {/* CHIP FILTERS */}
                <div className="flex flex-wrap gap-2 pt-1 items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Nature:</span>
                  {(['All', 'Income', 'Expense'] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setNatureFilter(n)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                        natureFilter === n 
                          ? 'bg-gray-900 text-white' 
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {n}
                    </button>
                  ))}

                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-2 mr-1">Type:</span>
                  {(['All', 'Cash', 'UPI', 'Other'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                        typeFilter === t 
                          ? 'bg-gray-900 text-white' 
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* LEDGER STREAM */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  <span>Showing {filteredRecords.length} Entries</span>
                  <span>Total: ₹{totalFilteredSum.toLocaleString('en-IN')}</span>
                </div>

                <div className="glass-card divide-y divide-gray-100 border-none rounded-2xl shadow-xs overflow-hidden">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map(rec => (
                      <div
                        key={rec.id}
                        onClick={() => setSelectedRecord(rec)}
                        className={`p-4 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-gray-50/70 transition-colors relative overflow-hidden select-none ${
                          selectedRecord?.id === rec.id ? 'bg-gray-50' : ''
                        }`}
                      >

                        <div className="flex items-center gap-3 min-w-0 relative z-10">
                          <div className={`p-2.5 rounded-xl shrink-0 ${
                            rec.transactionNature === 'Income' 
                              ? 'bg-emerald-50 text-emerald-600' 
                              : 'bg-rose-50 text-rose-600'
                          }`}>
                            {rec.transactionNature === 'Income' ? (
                              <ArrowDownLeft className="h-4.5 w-4.5" />
                            ) : (
                              <ArrowUpRight className="h-4.5 w-4.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-gray-900 truncate">{rec.purpose}</h4>
                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                              {rec.transactionNature === 'Income' ? `From: ${rec.moneySender}` : `To: ${rec.moneyReceiver}`}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-mono font-semibold bg-gray-100 px-1.5 py-0.5 rounded-md text-gray-500">
                                {rec.transactionType}
                              </span>
                              <span className="text-[9px] text-gray-400 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {rec.transactionDate}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 relative z-10">
                          <p className={`font-black text-sm ${
                            rec.transactionNature === 'Income' ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {rec.transactionNature === 'Income' ? '+' : '-'}₹{rec.amount.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[8px] text-gray-400 uppercase font-bold tracking-wider mt-0.5">Record ID: {rec.id.slice(-5)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-xs text-gray-400">
                      No transactions found matching your selection.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : activeTab === 'analytics' ? (
          /* ==================== ANALYTICS PANEL ==================== */
          <AnalyticsView records={records} />
        ) : activeTab === 'users' ? (
          /* ==================== MANAGE USERS PANEL ==================== */
          <div className="space-y-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-gray-950 tracking-tight">User Directory & Authorization Management</h2>
              <p className="text-xs text-gray-500">
                {currentUser.role === 'Super Admin' 
                  ? 'Provision, disable, and manage Trustees and Finance Managers.' 
                  : 'Provision and manage Finance Managers. (Note: Only Trustees can manage Trustees).'}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Provision form */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 h-fit">
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
                  <UserPlus className="h-4.5 w-4.5 text-gray-500" />
                  Provision Portal Account
                </h3>

                {userErrorMessage && (
                  <div className="bg-red-50 text-red-600 text-xs font-medium p-3 rounded-xl border border-red-100">
                    {userErrorMessage}
                  </div>
                )}

                {userSuccessMessage && (
                  <div className="bg-emerald-50 text-emerald-600 text-xs font-medium p-3 rounded-xl border border-emerald-100">
                    {userSuccessMessage}
                  </div>
                )}

                <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">User Role</label>
                    <select
                      value={newUserForm.role}
                      onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as 'Admin' | 'Finance Manager' | 'Viewer' })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-bold"
                    >
                      <option value="Finance Manager">Finance Manager (Data Entry)</option>
                      <option value="Viewer">Viewer (Read-Only Access)</option>
                      {currentUser.role === 'Super Admin' && (
                        <option value="Admin">Trustee (Analytics & Auditing)</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">User ID (Unique Username)</label>
                    <input
                      type="text"
                      placeholder="e.g. john.doe"
                      value={newUserForm.userId}
                      onChange={(e) => setNewUserForm({ ...newUserForm, userId: e.target.value.toLowerCase().replace(/\s/g, '') })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={newUserForm.name}
                      onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Account Password</label>
                    <input
                      type="text"
                      placeholder="e.g. apPass987"
                      value={newUserForm.password}
                      onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-xl transition-colors cursor-pointer text-center text-xs shadow-xs"
                  >
                    Provision Account
                  </button>
                </form>
              </div>

              {/* Users directory list */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm lg:col-span-2 space-y-4">
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide border-b border-gray-50 pb-2.5">
                  Authorized User Directory
                </h3>

                {directoryError && (
                  <div className="bg-red-50 text-red-600 text-xs font-semibold p-3 rounded-xl border border-red-100 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{directoryError}</span>
                  </div>
                )}

                <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto pr-2">
                  {isUsersLoading ? (
                    <div className="py-8 text-center text-xs text-gray-400">Loading directory...</div>
                  ) : allUsers.length > 0 ? (
                    allUsers.map(user => {
                      const isDisabled = currentUser.role === 'Admin' && user.role === 'Admin';
                      return (
                        <div key={user.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-gray-900">{user.name}</p>
                              <span className={`text-[8px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded-full ${
                                user.role === 'Super Admin'
                                  ? 'bg-purple-50 text-purple-700'
                                  : user.role === 'Admin'
                                  ? 'bg-blue-50 text-blue-700'
                                  : user.role === 'Viewer'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {user.role === 'Super Admin' || user.role === 'Admin' ? 'Trustee' : user.role}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">Username/ID: {user.userId} • Last Login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}</p>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {/* Edit Action: Super Admin can edit anyone, and Admin can edit non-Admin, non-SuperAdmin */}
                            {((currentUser.role === 'Super Admin') || 
                              (currentUser.role === 'Admin' && user.role !== 'Super Admin' && user.role !== 'Admin')) && (
                              <button
                                onClick={() => handleOpenEditUser(user)}
                                className="p-2 rounded-lg text-gray-400 hover:text-gray-950 hover:bg-gray-100 cursor-pointer transition-all"
                                title="Edit User Details & Password"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            )}

                            {/* Status toggle and delete buttons */}
                            {user.role !== 'Super Admin' ? (
                              <>
                                <button
                                  onClick={() => handleToggleUserStatus(user)}
                                  disabled={isDisabled}
                                  className={`px-3 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer transition-all ${
                                    isDisabled
                                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                      : user.status === 'active' 
                                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                  }`}
                                >
                                  {user.status === 'active' ? 'Active' : 'Disabled'}
                                </button>
                                <button
                                  onClick={() => initiateDeleteUser(user)}
                                  disabled={isDisabled}
                                  className={`p-2 rounded-lg transition-all ${
                                    isDisabled
                                      ? 'text-gray-300 cursor-not-allowed'
                                      : 'text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer'
                                  }`}
                                  title="Delete User"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              // Super Admin delete actions for OTHER Super Admins
                              currentUser.role === 'Super Admin' && user.id !== currentUser.id && (
                                <button
                                  onClick={() => initiateDeleteUser(user)}
                                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-all"
                                  title="Delete Trustee"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-gray-400">No registered users in directory.</div>
                  )}
                </div>
              </div>

            </div>

            {/* Edit User Modal Dialog */}
            {editingUser && (
              <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center p-4 z-50">
                <div className="bg-white border border-gray-100 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                      <Edit className="h-4.5 w-4.5 text-gray-600" />
                      Edit User Account: {editingUser.name}
                    </h3>
                    <button
                      onClick={() => setEditingUser(null)}
                      className="text-gray-400 hover:text-gray-600 text-lg font-bold focus:outline-none"
                    >
                      &times;
                    </button>
                  </div>

                  {editUserErrorMessage && (
                    <div className="bg-red-50 text-red-600 text-xs font-semibold p-3 rounded-xl border border-red-100">
                      {editUserErrorMessage}
                    </div>
                  )}

                  {editUserSuccessMessage && (
                    <div className="bg-emerald-50 text-emerald-600 text-xs font-semibold p-3 rounded-xl border border-emerald-100">
                      {editUserSuccessMessage}
                    </div>
                  )}

                  <form onSubmit={handleUpdateUser} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">User Role</label>
                      <select
                        value={editUserForm.role}
                        onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value as any })}
                        disabled={currentUser.role === 'Admin' && editUserForm.role !== 'Viewer' && editUserForm.role !== 'Finance Manager'}
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-bold disabled:opacity-60 text-gray-800"
                      >
                        <option value="Finance Manager">Finance Manager (Data Entry)</option>
                        <option value="Viewer">Viewer (Read-Only Access)</option>
                        <option value="Admin">Trustee (Analytics & Auditing)</option>
                        {currentUser.role === 'Super Admin' && (
                          <option value="Super Admin">Trustee (System Owner)</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">User ID (Unique Username)</label>
                      <input
                        type="text"
                        placeholder="e.g. john.doe"
                        value={editUserForm.userId}
                        onChange={(e) => setEditUserForm({ ...editUserForm, userId: e.target.value.toLowerCase().replace(/\s/g, '') })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-medium text-gray-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Full Name</label>
                      <input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={editUserForm.name}
                        onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-medium text-gray-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                        New Password <span className="text-gray-400 normal-case">(leave blank to keep current)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Type new password to reset"
                        value={editUserForm.password}
                        onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-mono text-gray-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Account Status</label>
                      <select
                        value={editUserForm.status}
                        onChange={(e) => setEditUserForm({ ...editUserForm, status: e.target.value as any })}
                        disabled={editingUser.id === currentUser.id}
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 font-bold disabled:opacity-60 text-gray-800"
                      >
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                      {editingUser.id === currentUser.id && (
                        <p className="text-[10px] text-gray-400 mt-1 italic">You cannot disable your own active session.</p>
                      )}
                    </div>

                    <div className="flex gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingUser(null)}
                        className="flex-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-bold py-3 rounded-xl transition-colors cursor-pointer text-center"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-gray-900 hover:bg-gray-950 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer text-center"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Delete User Confirmation Modal */}
            {deleteConfirmUser && (
              <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-sm w-full p-6 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center gap-3 text-rose-600">
                    <div className="bg-rose-50 p-2.5 rounded-xl">
                      <Trash2 className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-extrabold text-gray-950">
                      Delete User Account?
                    </h3>
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed">
                    Are you sure you want to permanently delete the user account <strong className="text-gray-900 font-extrabold">"{deleteConfirmUser.name}"</strong>? This action is irreversible and the user will lose all system access immediately.
                  </p>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmUser(null)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition-colors cursor-pointer text-center text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteUser}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer text-center text-xs"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'notices' ? (
          /* ==================== DISPUTED LEDGER NOTICES FOR ADMIN ==================== */
          <NoticesPanel 
            currentUser={currentUser} 
            records={records} 
            onRefreshRecords={onRefreshRecords} 
            onToggleChat={() => setIsChatOpen(prev => !prev)}
          />
        ) : (
          /* ==================== PROFILE / CONFIG PANEL ==================== */
          <ProfileView currentUser={currentUser} onUserUpdate={onUserUpdate} />
        )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* BOTTOM NAVIGATION DRAWER (MOBILE-FIRST) */}
      <nav id="bottom-navigation-drawer" className="glass-card !fixed bottom-0 left-0 right-0 py-2 px-6 z-20 shadow-2xl border-t border-white/30 backdrop-blur-xl !rounded-t-3xl !rounded-b-none !w-full !h-auto">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button
            onClick={() => setActiveTab('home')}
            className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
          >
            <GlassIcon 
              icon={Home} 
              variant="indigo" 
              size="sm" 
              glow={false}
              animated={activeTab === 'home'}
              className={activeTab === 'home' ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
            />
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'home' ? 'text-indigo-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
            }`}>Audit</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
          >
            <GlassIcon 
              icon={TrendingUp} 
              variant="blue" 
              size="sm" 
              glow={false}
              animated={activeTab === 'analytics'}
              className={activeTab === 'analytics' ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
            />
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'analytics' ? 'text-blue-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
            }`}>Analytics</span>
          </button>

          {currentUser.role !== 'Viewer' && (
            <button
              onClick={() => setActiveTab('notices')}
              className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
            >
              <GlassIcon 
                icon={AlertTriangle} 
                variant="rose" 
                size="sm" 
                glow={false}
                animated={activeTab === 'notices'}
                className={activeTab === 'notices' ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
                notificationActive={hasUnreadNotices}
              />
              <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
                activeTab === 'notices' ? 'text-rose-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
              }`}>Notice</span>
            </button>
          )}

          {currentUser.role !== 'Viewer' && (
            <button
              onClick={() => setActiveTab('users')}
              className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
            >
              <GlassIcon 
                icon={UsersIcon} 
                variant="violet" 
                size="sm" 
                glow={false}
                animated={activeTab === 'users'}
                className={activeTab === 'users' ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
              />
              <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
                activeTab === 'users' ? 'text-violet-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
              }`}>Users</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('profile')}
            className="flex flex-col items-center gap-1 cursor-pointer focus:outline-none group"
          >
            <GlassIcon 
              icon={User} 
              variant="amber" 
              size="sm" 
              glow={false}
              animated={activeTab === 'profile'}
              className={activeTab === 'profile' ? 'scale-105' : 'opacity-65 group-hover:opacity-100'} 
            />
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'profile' ? 'text-amber-700 font-extrabold' : 'text-slate-400 group-hover:text-slate-600'
            }`}>Profile</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {disputingRecord && (
          <DisputeModal
            isOpen={!!disputingRecord}
            onClose={() => setDisputingRecord(null)}
            record={disputingRecord}
            currentUser={currentUser}
            onSuccess={onRefreshRecords}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRecord && (
          <RecordDetailsModal
            isOpen={!!selectedRecord}
            onClose={() => setSelectedRecord(null)}
            record={selectedRecord}
            onRaiseDispute={currentUser.role !== 'Viewer' ? () => setDisputingRecord(selectedRecord) : undefined}
          />
        )}
      </AnimatePresence>

      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        records={records}
      />

      <ChatWidget 
        currentUser={currentUser} 
        isOpen={isChatOpen}
        setIsOpen={setIsChatOpen}
      />
    </div>
  );
}
