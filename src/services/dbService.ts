import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, withTimeout } from '../firebase';
import { User, TransactionRecord, Organization, Notice, Message } from '../types';

const LOCAL_KEYS = {
  USERS: 'mvp_local_users',
  RECORDS: 'mvp_local_records',
  ORG: 'mvp_local_org',
  NOTICES: 'mvp_local_notices',
  MESSAGES: 'mvp_local_messages',
};

// Browser-native secure SHA-256 password hashing
export async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if a Firestore error indicates client is offline or network is unreachable
function isFirestoreOffline(error: any): boolean {
  if (!error) return false;
  const errMsg = String(error.message || error).toLowerCase();
  return (
    errMsg.includes('offline') ||
    errMsg.includes('could not reach') ||
    errMsg.includes('failed to get document') ||
    errMsg.includes('network') ||
    errMsg.includes('unavailable') ||
    errMsg.includes('timed out') ||
    !navigator.onLine
  );
}

// Seed initial fallback data to local storage if it doesn't exist
async function ensureLocalSeeded() {
  const existingOrg = localStorage.getItem(LOCAL_KEYS.ORG);
  if (!existingOrg) {
    const defaultOrg: Organization = {
      id: 'mvp_org',
      organizationName: 'MVP-Ledger',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem(LOCAL_KEYS.ORG, JSON.stringify(defaultOrg));
  }

  const existingUsers = localStorage.getItem(LOCAL_KEYS.USERS);
  if (!existingUsers) {
    const initialUsers = [
      {
        id: 'user_superadmin',
        userId: 'superadmin',
        name: 'John Miller (Trustee)',
        passwordHash: await hashPassword('admin123'),
        role: 'Super Admin' as const,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'user_admin',
        userId: 'admin',
        name: 'Alice Smith (Trustee)',
        passwordHash: await hashPassword('admin123'),
        role: 'Admin' as const,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'user_aarthik1',
        userId: 'aarthik1',
        name: 'Robert Johnson (Finance Manager)',
        passwordHash: await hashPassword('aarthik123'),
        role: 'Finance Manager' as const,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    localStorage.setItem(LOCAL_KEYS.USERS, JSON.stringify(initialUsers));
  }

  const existingRecords = localStorage.getItem(LOCAL_KEYS.RECORDS);
  if (!existingRecords) {
    const initialRecords: TransactionRecord[] = [
      {
        id: 'rec_01',
        transactionNature: 'Income',
        moneySender: 'David Wilson (Donor)',
        moneyReceiver: 'MVP-Ledger',
        transactionType: 'UPI',
        amount: 25000,
        purpose: 'Education Sponsorship Donation',
        transactionDate: '2026-06-30',
        notes: 'Earmarked for laptop acquisition and computer learning resources.',
        createdBy: 'aarthik1',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'rec_02',
        transactionNature: 'Expense',
        moneySender: 'MVP-Ledger',
        moneyReceiver: 'Metro Stationers',
        transactionType: 'Cash',
        amount: 3200,
        purpose: 'Study materials printing',
        transactionDate: '2026-07-01',
        notes: 'Printed curriculum and study books for 150 kids.',
        createdBy: 'aarthik1',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'rec_03',
        transactionNature: 'Income',
        moneySender: 'Grants Department',
        moneyReceiver: 'MVP-Ledger',
        transactionType: 'Other',
        amount: 50000,
        purpose: 'Midday Meal Project Support',
        transactionDate: '2026-06-15',
        notes: 'First financial block allocation of academic year 2026.',
        createdBy: 'aarthik1',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'rec_04',
        transactionNature: 'Expense',
        moneySender: 'MVP-Ledger',
        moneyReceiver: 'Elite Catering',
        transactionType: 'UPI',
        amount: 4500,
        purpose: 'Annual Volunteer Meeting Refreshments',
        transactionDate: '2026-07-02',
        notes: 'Snacks, tea, and drinks served to 30 core group members.',
        createdBy: 'aarthik1',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    localStorage.setItem(LOCAL_KEYS.RECORDS, JSON.stringify(initialRecords));
  }

  const existingNotices = localStorage.getItem(LOCAL_KEYS.NOTICES);
  if (!existingNotices) {
    localStorage.setItem(LOCAL_KEYS.NOTICES, JSON.stringify([]));
  }
}

export const dbService = {
  // Bootstrap standard data (Users, Org, Records) if empty
  async bootstrapDataIfNeeded(): Promise<void> {
    await ensureLocalSeeded();
    try {
      console.log('Attempting to bootstrap Firestore database...');
      const orgSnap = await withTimeout(getDoc(doc(db, 'organization', 'mvp_org')), 2500);
      if (!orgSnap.exists()) {
        console.log('Database seems empty. Bootstrapping MVP-Ledger finance system to Firestore...');

        // 1. Seed Organization
        const org: Organization = {
          id: 'mvp_org',
          organizationName: 'MVP-Ledger',
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'organization', 'mvp_org'), org);

        // 2. Seed Initial Users
        const initialUsers = JSON.parse(localStorage.getItem(LOCAL_KEYS.USERS) || '[]');
        for (const newUser of initialUsers) {
          await setDoc(doc(db, 'users', newUser.id), newUser);
        }

        // 3. Seed Sample Records
        const initialRecords = JSON.parse(localStorage.getItem(LOCAL_KEYS.RECORDS) || '[]');
        for (const r of initialRecords) {
          await setDoc(doc(db, 'records', r.id), r);
        }

        console.log('Firestore Database bootstrap successfully complete!');
      } else {
        console.log('Firestore Database already initialized. Loading to local cache asynchronously...');
        // Save Organization info immediately (extremely fast)
        const orgData = orgSnap.data() as Organization;
        localStorage.setItem(LOCAL_KEYS.ORG, JSON.stringify(orgData));

        // Sync other collections IN THE BACKGROUND, completely non-blocking!
        // This solves the server response delay completely on startup!
        (async () => {
          try {
            const [usersSnap, recordsSnap, noticesSnap] = await Promise.all([
              getDocs(collection(db, 'users')),
              getDocs(collection(db, 'records')),
              getDocs(collection(db, 'notices'))
            ]);

            const usersList = usersSnap.docs.map(d => d.data() as User);
            localStorage.setItem(LOCAL_KEYS.USERS, JSON.stringify(usersList));

            const recordsList = recordsSnap.docs.map(d => d.data() as TransactionRecord);
            localStorage.setItem(LOCAL_KEYS.RECORDS, JSON.stringify(recordsList));

            const noticesList = noticesSnap.docs.map(d => d.data() as Notice);
            localStorage.setItem(LOCAL_KEYS.NOTICES, JSON.stringify(noticesList));

            try {
              const messagesSnap = await getDocs(collection(db, 'messages'));
              const messagesList = messagesSnap.docs.map(d => d.data() as Message);
              localStorage.setItem(LOCAL_KEYS.MESSAGES, JSON.stringify(messagesList));
            } catch (e) {
              console.warn('Background sync messages failed', e);
            }
            console.log('Background cache synchronization completed successfully.');
          } catch (syncErr) {
            console.warn('Background database synchronization failed', syncErr);
          }
        })();
      }
    } catch (err) {
      console.warn('Failed to bootstrap database in Firestore (possibly offline). App will run in offline mode using local cache.', err);
    }
  },

  // USERS SERVICES
  async getUsers(): Promise<User[]> {
    const path = 'users';
    try {
      const snap = await withTimeout(getDocs(collection(db, path)), 2500);
      const users = snap.docs.map(doc => doc.data() as User);
      localStorage.setItem(LOCAL_KEYS.USERS, JSON.stringify(users));
      return users;
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, loading users from local storage');
        await ensureLocalSeeded();
        return JSON.parse(localStorage.getItem(LOCAL_KEYS.USERS) || '[]');
      }
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async getUserByUserId(userId: string): Promise<User | null> {
    const path = 'users';
    try {
      const q = query(collection(db, path), where('userId', '==', userId));
      const snap = await withTimeout(getDocs(q), 2500);
      if (snap.empty) return null;
      const user = snap.docs[0].data() as User;
      
      // Update local storage for this user in the cache
      try {
        const localUsers = JSON.parse(localStorage.getItem(LOCAL_KEYS.USERS) || '[]') as User[];
        const index = localUsers.findIndex(u => u.id === user.id);
        if (index > -1) {
          localUsers[index] = user;
        } else {
          localUsers.push(user);
        }
        localStorage.setItem(LOCAL_KEYS.USERS, JSON.stringify(localUsers));
      } catch (e) {}

      return user;
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, querying user from local storage');
        await ensureLocalSeeded();
        const localUsers = JSON.parse(localStorage.getItem(LOCAL_KEYS.USERS) || '[]') as User[];
        return localUsers.find(u => u.userId === userId) || null;
      }
      handleFirestoreError(err, OperationType.GET, `${path}/userId/${userId}`);
    }
  },

  async createUser(user: User): Promise<void> {
    const path = `users/${user.id}`;
    // Update local first so user doesn't lose state
    try {
      const localUsers = JSON.parse(localStorage.getItem(LOCAL_KEYS.USERS) || '[]') as User[];
      localUsers.push(user);
      localStorage.setItem(LOCAL_KEYS.USERS, JSON.stringify(localUsers));
    } catch (e) {}

    try {
      await setDoc(doc(db, 'users', user.id), user);
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, saved user to local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async updateUser(id: string, data: Partial<User>): Promise<void> {
    const path = `users/${id}`;
    // Update local first
    try {
      const localUsers = JSON.parse(localStorage.getItem(LOCAL_KEYS.USERS) || '[]') as User[];
      const index = localUsers.findIndex(u => u.id === id);
      if (index > -1) {
        localUsers[index] = {
          ...localUsers[index],
          ...data,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(LOCAL_KEYS.USERS, JSON.stringify(localUsers));
      }
    } catch (e) {}

    try {
      await updateDoc(doc(db, 'users', id), {
        ...data,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, updated user in local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  async deleteUser(id: string): Promise<void> {
    const path = `users/${id}`;
    // Delete local first
    try {
      const localUsers = JSON.parse(localStorage.getItem(LOCAL_KEYS.USERS) || '[]') as User[];
      const filtered = localUsers.filter(u => u.id !== id);
      localStorage.setItem(LOCAL_KEYS.USERS, JSON.stringify(filtered));
    } catch (e) {}

    try {
      await deleteDoc(doc(db, 'users', id));
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, deleted user from local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // RECORDS SERVICES
  async getRecords(): Promise<TransactionRecord[]> {
    const path = 'records';
    try {
      const snap = await withTimeout(getDocs(collection(db, path)), 2500);
      const records = snap.docs.map(doc => doc.data() as TransactionRecord);
      localStorage.setItem(LOCAL_KEYS.RECORDS, JSON.stringify(records));
      return records.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, loading records from local storage');
        await ensureLocalSeeded();
        const records = JSON.parse(localStorage.getItem(LOCAL_KEYS.RECORDS) || '[]') as TransactionRecord[];
        return records.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
      }
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createRecord(record: TransactionRecord): Promise<void> {
    const path = `records/${record.id}`;
    // Save to local first
    try {
      const localRecords = JSON.parse(localStorage.getItem(LOCAL_KEYS.RECORDS) || '[]') as TransactionRecord[];
      localRecords.push(record);
      localStorage.setItem(LOCAL_KEYS.RECORDS, JSON.stringify(localRecords));
    } catch (e) {}

    try {
      await setDoc(doc(db, 'records', record.id), record);
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, saved record to local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async updateRecord(id: string, data: Partial<TransactionRecord>): Promise<void> {
    const path = `records/${id}`;
    // Save to local first
    try {
      const localRecords = JSON.parse(localStorage.getItem(LOCAL_KEYS.RECORDS) || '[]') as TransactionRecord[];
      const index = localRecords.findIndex(r => r.id === id);
      if (index > -1) {
        localRecords[index] = {
          ...localRecords[index],
          ...data,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(LOCAL_KEYS.RECORDS, JSON.stringify(localRecords));
      }
    } catch (e) {}

    try {
      await updateDoc(doc(db, 'records', id), {
        ...data,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, updated record in local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  async deleteRecord(id: string): Promise<void> {
    const path = `records/${id}`;
    // Save to local first
    try {
      const localRecords = JSON.parse(localStorage.getItem(LOCAL_KEYS.RECORDS) || '[]') as TransactionRecord[];
      const filtered = localRecords.filter(r => r.id !== id);
      localStorage.setItem(LOCAL_KEYS.RECORDS, JSON.stringify(filtered));
    } catch (e) {}

    try {
      await deleteDoc(doc(db, 'records', id));
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, deleted record from local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // ORGANIZATION SERVICES
  async getOrganization(): Promise<Organization> {
    const path = 'organization/mvp_org';
    try {
      const snap = await getDoc(doc(db, 'organization', 'mvp_org'));
      if (snap.exists()) {
        const org = snap.data() as Organization;
        localStorage.setItem(LOCAL_KEYS.ORG, JSON.stringify(org));
        return org;
      }
      const defaultOrg: Organization = {
        id: 'mvp_org',
        organizationName: 'MVP-Ledger',
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'organization', 'mvp_org'), defaultOrg);
      localStorage.setItem(LOCAL_KEYS.ORG, JSON.stringify(defaultOrg));
      return defaultOrg;
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, loading organization from local storage');
        await ensureLocalSeeded();
        return JSON.parse(localStorage.getItem(LOCAL_KEYS.ORG) || '{"id":"mvp_org","organizationName":"MVP-Ledger"}');
      }
      handleFirestoreError(err, OperationType.GET, path);
    }
  },

  async updateOrganization(data: Partial<Organization>): Promise<void> {
    const path = 'organization/mvp_org';
    // Save to local first
    try {
      const localOrg = JSON.parse(localStorage.getItem(LOCAL_KEYS.ORG) || '{}');
      const updated = { ...localOrg, ...data };
      localStorage.setItem(LOCAL_KEYS.ORG, JSON.stringify(updated));
    } catch (e) {}

    try {
      await updateDoc(doc(db, 'organization', 'mvp_org'), data);
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, updated organization in local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  // NOTICE SERVICES
  async getNotices(): Promise<Notice[]> {
    const path = 'notices';
    try {
      const snap = await getDocs(collection(db, path));
      const notices = snap.docs.map(doc => doc.data() as Notice);
      localStorage.setItem(LOCAL_KEYS.NOTICES, JSON.stringify(notices));
      return notices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, loading notices from local storage');
        await ensureLocalSeeded();
        const notices = JSON.parse(localStorage.getItem(LOCAL_KEYS.NOTICES) || '[]') as Notice[];
        return notices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createNotice(notice: Notice): Promise<void> {
    const path = `notices/${notice.id}`;
    // Save to local first
    try {
      const localNotices = JSON.parse(localStorage.getItem(LOCAL_KEYS.NOTICES) || '[]') as Notice[];
      localNotices.push(notice);
      localStorage.setItem(LOCAL_KEYS.NOTICES, JSON.stringify(localNotices));
    } catch (e) {}

    try {
      await setDoc(doc(db, 'notices', notice.id), notice);
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, saved notice to local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async resolveNotice(id: string): Promise<void> {
    const path = `notices/${id}`;
    // Save to local first
    try {
      const localNotices = JSON.parse(localStorage.getItem(LOCAL_KEYS.NOTICES) || '[]') as Notice[];
      const index = localNotices.findIndex(n => n.id === id);
      if (index > -1) {
        localNotices[index].status = 'resolved';
        localStorage.setItem(LOCAL_KEYS.NOTICES, JSON.stringify(localNotices));
      }
    } catch (e) {}

    try {
      await updateDoc(doc(db, 'notices', id), {
        status: 'resolved'
      });
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, resolved notice in local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  async getMessages(): Promise<Message[]> {
    const path = 'messages';
    try {
      const snap = await getDocs(collection(db, path));
      const messages = snap.docs.map(doc => doc.data() as Message);
      localStorage.setItem(LOCAL_KEYS.MESSAGES, JSON.stringify(messages));
      return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, loading messages from local storage');
        const messages = JSON.parse(localStorage.getItem(LOCAL_KEYS.MESSAGES) || '[]') as Message[];
        return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  subscribeMessages(callback: (messages: Message[]) => void): () => void {
    const path = 'messages';
    const q = query(collection(db, path), orderBy('createdAt', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => doc.data() as Message);
      localStorage.setItem(LOCAL_KEYS.MESSAGES, JSON.stringify(messages));
      callback(messages);
    }, (err) => {
      console.error('Error in messages subscription:', err);
      // Fallback: load from local storage
      const messages = JSON.parse(localStorage.getItem(LOCAL_KEYS.MESSAGES) || '[]') as Message[];
      callback(messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    });
  },

  async createMessage(message: Message): Promise<void> {
    const path = `messages/${message.id}`;
    try {
      const localMessages = JSON.parse(localStorage.getItem(LOCAL_KEYS.MESSAGES) || '[]') as Message[];
      localMessages.push(message);
      localStorage.setItem(LOCAL_KEYS.MESSAGES, JSON.stringify(localMessages));
    } catch (e) {}

    try {
      await setDoc(doc(db, 'messages', message.id), message);
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, saved message to local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async updateMessage(id: string, updates: Partial<Message>): Promise<void> {
    const path = `messages/${id}`;
    try {
      const localMessages = JSON.parse(localStorage.getItem(LOCAL_KEYS.MESSAGES) || '[]') as Message[];
      const index = localMessages.findIndex(m => m.id === id);
      if (index > -1) {
        localMessages[index] = { ...localMessages[index], ...updates };
        localStorage.setItem(LOCAL_KEYS.MESSAGES, JSON.stringify(localMessages));
      }
    } catch (e) {}

    try {
      await updateDoc(doc(db, 'messages', id), updates);
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, updated message in local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  async deleteMessage(id: string): Promise<void> {
    const path = `messages/${id}`;
    try {
      const localMessages = JSON.parse(localStorage.getItem(LOCAL_KEYS.MESSAGES) || '[]') as Message[];
      const updated = localMessages.filter(m => m.id !== id);
      localStorage.setItem(LOCAL_KEYS.MESSAGES, JSON.stringify(updated));
    } catch (e) {}

    try {
      await deleteDoc(doc(db, 'messages', id));
    } catch (err) {
      if (isFirestoreOffline(err)) {
        console.warn('Firestore is offline, deleted message from local storage only');
        return;
      }
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
};

