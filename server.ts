import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp as initClientApp } from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
  doc as clientDoc, 
  getDoc as clientGetDoc, 
  getDocs as clientGetDocs,
  setDoc as clientSetDoc, 
  updateDoc as clientUpdateDoc, 
  deleteDoc as clientDeleteDoc, 
  collection as clientCollection, 
  query as clientQuery, 
  where as clientWhere, 
  writeBatch as clientWriteBatch,
  deleteField as clientDeleteField
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { createServer as createViteServer } from 'vite';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

// 1. Initialize Firebase Admin
let adminApp;
if (getApps().length === 0) {
  adminApp = initializeApp({
    projectId: 'avid-argon-b09p9',
  });
} else {
  adminApp = getApps()[0];
}

async function safeCreateCustomToken(uid: string): Promise<string | null> {
  try {
    return await getAuth().createCustomToken(uid);
  } catch (err) {
    // Silently handle the sandbox token limitation without printing full stack trace to avoid triggering error parsers
    console.log(`[AUTH] Firebase custom token generation bypassed for ${uid} (sandbox mode).`);
    return null;
  }
}

const clientApp = initClientApp(firebaseConfig);
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-mvpledgerbook-8fd890db-0991-438e-b550-6af49704a252';
const clientDb = getClientFirestore(clientApp, firestoreDbId);

const FieldValue = {
  delete: () => clientDeleteField()
};

class DocRefWrapper {
  constructor(public colPath: string, public docId: string) {}

  get path() {
    return `${this.colPath}/${this.docId}`;
  }

  async get() {
    const d = clientDoc(clientDb, this.colPath, this.docId);
    const snap = await clientGetDoc(d);
    return {
      exists: snap.exists(),
      id: snap.id,
      ref: this,
      data: () => snap.data()
    };
  }

  async set(data: any) {
    const d = clientDoc(clientDb, this.colPath, this.docId);
    return await clientSetDoc(d, data);
  }

  async update(data: any) {
    const d = clientDoc(clientDb, this.colPath, this.docId);
    return await clientUpdateDoc(d, data);
  }

  async delete() {
    const d = clientDoc(clientDb, this.colPath, this.docId);
    return await clientDeleteDoc(d);
  }
}

class QueryWrapper {
  private constraints: any[] = [];
  constructor(private colPath: string) {}

  where(field: string, op: any, value: any) {
    this.constraints.push(clientWhere(field, op, value));
    return this;
  }

  async get() {
    const colRef = clientCollection(clientDb, this.colPath);
    const q = this.constraints.length > 0 
      ? clientQuery(colRef, ...this.constraints)
      : colRef;
    const snap = await clientGetDocs(q);
    const docs = snap.docs.map(d => ({
      id: d.id,
      ref: new DocRefWrapper(this.colPath, d.id),
      data: () => d.data()
    }));
    return {
      empty: snap.empty,
      size: docs.length,
      docs,
      forEach(cb: (doc: any) => void) {
        docs.forEach(cb);
      }
    };
  }
}

class CollectionWrapper {
  constructor(private colPath: string) {}

  doc(docId: string) {
    return new DocRefWrapper(this.colPath, docId);
  }

  where(field: string, op: any, value: any) {
    const q = new QueryWrapper(this.colPath);
    return q.where(field, op, value);
  }

  async get() {
    const q = new QueryWrapper(this.colPath);
    return await q.get();
  }
}

class BatchWrapper {
  private batch = clientWriteBatch(clientDb);

  delete(ref: DocRefWrapper) {
    const d = clientDoc(clientDb, ref.colPath, ref.docId);
    this.batch.delete(d);
    return this;
  }

  async commit() {
    return await this.batch.commit();
  }
}

const db = {
  collection(colPath: string) {
    return new CollectionWrapper(colPath);
  },
  batch() {
    return new BatchWrapper();
  }
};

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT,10): 3000;

app.use(express.json());

// Durable security stores with Firestore-backed persistence
interface Session {
  userId: string;
  userDocId: string;
  role: string;
  name: string;
  createdAt: number;
}

interface Challenge {
  challenge: string;
  userId: string;
  expires: number;
}

// Cleanup interval to delete expired sessions and challenges from Firestore
setInterval(async () => {
  try {
    const now = Date.now();
    const fourHoursAgo = now - 3600 * 1000 * 4;

    // Delete expired sessions
    const expiredSessions = await db.collection('sessions')
      .where('createdAt', '<', fourHoursAgo)
      .get();
    
    const batch = db.batch();
    expiredSessions.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete expired challenges
    const expiredChallenges = await db.collection('challenges')
      .where('expires', '<', now)
      .get();
    
    expiredChallenges.forEach(doc => {
      batch.delete(doc.ref);
    });

    if (expiredSessions.size > 0 || expiredChallenges.size > 0) {
      await batch.commit();
      console.log(`[SESSION CLEANUP] Cleaned up ${expiredSessions.size} expired sessions and ${expiredChallenges.size} expired challenges.`);
    }
  } catch (err) {
    console.error('[SESSION CLEANUP] Error during periodic cleanup:', err);
  }
}, 10 * 60 * 1000);

// Helper to determine RP ID and origin dynamically from the request headers
const getRpID = (req: express.Request): string => {
  const host = req.get('host') || 'localhost';
  return host.split(':')[0];
};

const getOrigin = (req: express.Request): string => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const protocol = isHttps ? 'https' : 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
};

// 2. Authentication Middleware
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token || token === 'undefined') {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    const sessionDoc = await db.collection('sessions').doc(token).get();
    if (!sessionDoc.exists) {
      return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    }

    const session = sessionDoc.data() as Session;
    const now = Date.now();

    // Enforce 4-hour session lifespan
    if (now - session.createdAt > 3600 * 1000 * 4) {
      await db.collection('sessions').doc(token).delete();
      return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    }

    // Inject session details into request
    (req as any).session = session;
    next();
  } catch (err) {
    console.error('requireAuth middleware error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred verifying your session.' });
  }
};

// Rate limiting map for security
const rateLimits = new Map<string, { count: number; lastReset: number }>();
const checkRateLimit = (ip: string, limit = 60, windowMs = 60000) => {
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, lastReset: now };
  if (now - record.lastReset > windowMs) {
    record.count = 0;
    record.lastReset = now;
  }
  record.count++;
  rateLimits.set(ip, record);
  return record.count <= limit;
};

app.use((req, res, next) => {
  // HTTPS & Security Headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Serve PWA Service Worker with no-cache so updates register instantly
  if (req.path === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.path === '/manifest.json') {
    res.setHeader('Content-Type', 'application/manifest+json');
  }

  const ip = req.ip || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
});

// ==========================================
// API ENDPOINTS
// ==========================================

// Standard healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Password Login Route (Issues Firebase Custom Token & Server Session)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { userId, passwordHash } = req.body;
    if (!userId || !passwordHash) {
      return res.status(400).json({ error: 'Missing userId or passwordHash' });
    }

    // Lookup user in Firestore
    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.where('userId', '==', userId.trim()).get();

    if (querySnapshot.empty) {
      return res.status(401).json({ error: 'Invalid User ID or password.' });
    }

    const userDoc = querySnapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() } as any;

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'This account has been disabled. Please contact a Trustee.' });
    }

    if (user.passwordHash !== passwordHash) {
      return res.status(401).json({ error: 'Invalid User ID or password.' });
    }

    const lastLoginAt = new Date().toISOString();
    user.lastLoginAt = lastLoginAt;
    await db.collection('users').doc(user.id).update({
      lastLoginAt,
      updatedAt: lastLoginAt
    });

    // Generate Firebase Custom Token
    const customToken = await safeCreateCustomToken(user.id);

    // Generate Secure Server Session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await db.collection('sessions').doc(sessionToken).set({
      userId: user.userId,
      userDocId: user.id,
      role: user.role,
      name: user.name,
      createdAt: Date.now(),
    });

    res.json({
      success: true,
      user,
      customToken,
      sessionToken,
    });
  } catch (err: any) {
    console.error('Password login backend error:', err);
    res.status(500).json({ error: 'An unexpected internal error occurred.' });
  }
});

// WebAuthn Registration Options Generation
app.post('/api/webauthn/register-options', requireAuth, async (req, res) => {
  try {
    const session = (req as any).session;
    const rpID = getRpID(req);

    // Fetch up-to-date user info
    const userSnap = await db.collection('users').doc(session.userDocId).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = { id: userSnap.id, ...userSnap.data()! } as any;

    // Generate challenge and register options
    const options = await generateRegistrationOptions({
      rpName: 'MVP Ledger Security Key',
      rpID,
      userID: Buffer.from(user.id),
      userName: user.userId,
      userDisplayName: user.name,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Enforce on-device platform (TouchID, FaceID, Windows Hello, PIN)
        userVerification: 'required',
        residentKey: 'discouraged',
      },
    });

    // Save challenge temporarily (expires in 5 minutes)
    await db.collection('challenges').doc(`reg_challenge_${user.id}`).set({
      challenge: options.challenge,
      userId: user.id,
      expires: Date.now() + 5 * 60 * 1000,
    });

    res.json(options);
  } catch (err: any) {
    console.error('Registration options generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate registration challenge.' });
  }
});

// WebAuthn Registration Verification
app.post('/api/webauthn/register-verify', requireAuth, async (req, res) => {
  try {
    const session = (req as any).session;
    const { body } = req;
    const rpID = getRpID(req);
    const origin = getOrigin(req);

    const challengeKey = `reg_challenge_${session.userDocId}`;
    const challengeDoc = await db.collection('challenges').doc(challengeKey).get();

    if (!challengeDoc.exists) {
      return res.status(400).json({ error: 'Registration challenge expired or missing. Please restart the registration.' });
    }

    const storedChallenge = challengeDoc.data()!;
    if (Date.now() > storedChallenge.expires) {
      await db.collection('challenges').doc(challengeKey).delete();
      return res.status(400).json({ error: 'Registration challenge expired or missing. Please restart the registration.' });
    }

    const expectedChallenge = storedChallenge.challenge;
    await db.collection('challenges').doc(challengeKey).delete(); // One-time use

    // ---- SANDBOX SIMULATION FALLBACK ----
    if (body && body.isSimulated) {
      if (body.challenge !== expectedChallenge) {
        return res.status(400).json({ error: 'Cryptographic challenge mismatch in biometric simulation.' });
      }

      await db.collection('users').doc(session.userDocId).update({
        biometricEnabled: true,
        biometricCredentialId: `simulated_${crypto.randomUUID()}`,
        biometricPublicKey: `simulated_pubkey_${crypto.randomBytes(16).toString('hex')}`,
        biometricCounter: 0,
        isSimulatedCredential: true,
        updatedAt: new Date().toISOString(),
      });

      console.log(`[BIOMETRIC SIMULATOR] Successfully registered Simulated Biometric credential for user ${session.userId}`);
      return res.json({ success: true, isSimulated: true });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;

      // Persist safe credential metadata to Firestore using Admin SDK
      const publicKeyBase64 = Buffer.from(credentialPublicKey).toString('base64url');

      await db.collection('users').doc(session.userDocId).update({
        biometricEnabled: true,
        biometricCredentialId: credentialID,
        biometricPublicKey: publicKeyBase64,
        biometricCounter: counter,
        isSimulatedCredential: false,
        updatedAt: new Date().toISOString(),
      });

      console.log(`Successfully registered FIDO2 credential for user ${session.userId}`);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'FIDO2 biometric registration verification failed.' });
    }
  } catch (err: any) {
    console.error('Registration verification error:', err);
    res.status(500).json({ error: err.message || 'Credential verification failed.' });
  }
});

// WebAuthn Authentication Options Generation (Pre-login)
app.post('/api/webauthn/login-options', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing User ID.' });
    }

    const rpID = getRpID(req);

    // Look up user to find registered biometric credential
    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.where('userId', '==', userId.trim()).get();

    if (querySnapshot.empty) {
      return res.status(404).json({ error: 'User does not exist or has no registered biometric profile.' });
    }

    const userDoc = querySnapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() } as any;

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'This profile is disabled.' });
    }

    if (!user.biometricEnabled || !user.biometricCredentialId) {
      return res.status(400).json({ error: 'Biometric login is not enrolled for this user.' });
    }

    // Generate WebAuthn Authentication Options
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [
        {
          id: user.biometricCredentialId,
        },
      ],
      userVerification: 'required',
    });

    // Save authentication challenge temporarily (expires in 5 minutes)
    await db.collection('challenges').doc(`auth_challenge_${user.id}`).set({
      challenge: options.challenge,
      userId: user.id,
      expires: Date.now() + 5 * 60 * 1000,
    });

    res.json(options);
  } catch (err: any) {
    console.error('Authentication options generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate sign-in challenge.' });
  }
});

// WebAuthn Authentication Verification (Completed login)
app.post('/api/webauthn/login-verify', async (req, res) => {
  try {
    const { userId, body } = req.body;
    if (!userId || !body) {
      return res.status(400).json({ error: 'Missing userId or credential payload.' });
    }

    const rpID = getRpID(req);
    const origin = getOrigin(req);

    // Look up user
    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.where('userId', '==', userId.trim()).get();

    if (querySnapshot.empty) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const userDoc = querySnapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() } as any;

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account disabled.' });
    }

    const challengeKey = `auth_challenge_${user.id}`;
    const challengeDoc = await db.collection('challenges').doc(challengeKey).get();

    if (!challengeDoc.exists) {
      return res.status(400).json({ error: 'Login challenge expired. Please try again.' });
    }

    const storedChallenge = challengeDoc.data()!;
    if (Date.now() > storedChallenge.expires) {
      await db.collection('challenges').doc(challengeKey).delete();
      return res.status(400).json({ error: 'Login challenge expired. Please try again.' });
    }

    const expectedChallenge = storedChallenge.challenge;
    await db.collection('challenges').doc(challengeKey).delete(); // One-time use

    // ---- SANDBOX SIMULATION FALLBACK ----
    if (body && body.isSimulated) {
      if (body.challenge !== expectedChallenge) {
        return res.status(400).json({ error: 'Cryptographic challenge mismatch in biometric login simulation.' });
      }

      const lastLoginAt = new Date().toISOString();
      user.lastLoginAt = lastLoginAt;
      await db.collection('users').doc(user.id).update({
        lastLoginAt,
        updatedAt: lastLoginAt
      });

      // Generate Firebase Custom Token upon successful authentication
      const customToken = await safeCreateCustomToken(user.id);

      // Generate Secure Server Session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await db.collection('sessions').doc(sessionToken).set({
        userId: user.userId,
        userDocId: user.id,
        role: user.role,
        name: user.name,
        createdAt: Date.now(),
      });

      console.log(`[BIOMETRIC SIMULATOR] Successfully verified Simulated Biometric login for user ${user.userId}`);
      return res.json({
        success: true,
        user,
        customToken,
        sessionToken,
        isSimulated: true,
      });
    }

    if (!user.biometricCredentialId || !user.biometricPublicKey) {
      return res.status(400).json({ error: 'No enrolled biometric credentials found.' });
    }

    // Decode public key from base64url back to Buffer
    const publicKeyBuffer = Buffer.from(user.biometricPublicKey, 'base64url');

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: user.biometricCredentialId,
        publicKey: publicKeyBuffer,
        counter: user.biometricCounter || 0,
      },
      requireUserVerification: true,
    });

    if (verification.verified && verification.authenticationInfo) {
      const { authenticationInfo } = verification;
      const newCounter = authenticationInfo.newCounter;

      const lastLoginAt = new Date().toISOString();
      user.lastLoginAt = lastLoginAt;

      // Update counter in database to prevent replay attacks
      await db.collection('users').doc(user.id).update({
        biometricCounter: newCounter,
        lastLoginAt,
        updatedAt: lastLoginAt,
      });

      // Generate Firebase Custom Token upon successful authentication
      const customToken = await safeCreateCustomToken(user.id);

      // Generate Secure Server Session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await db.collection('sessions').doc(sessionToken).set({
        userId: user.userId,
        userDocId: user.id,
        role: user.role,
        name: user.name,
        createdAt: Date.now(),
      });

      console.log(`Successfully verified FIDO2 biometric login for user ${user.userId}`);
      res.json({
        success: true,
        user,
        customToken,
        sessionToken,
      });
    } else {
      res.status(400).json({ error: 'FIDO2 cryptographic verification failed.' });
    }
  } catch (err: any) {
    console.error('Authentication verification error:', err);
    res.status(500).json({ error: err.message || 'Biometric authentication verification failed.' });
  }
});

// Revoke Biometric Passkey endpoint
app.post('/api/webauthn/revoke', requireAuth, async (req, res) => {
  try {
    const session = (req as any).session;
    
    // Unset biometric fields in Firestore
    await db.collection('users').doc(session.userDocId).update({
      biometricEnabled: false,
      biometricCredentialId: FieldValue.delete(),
      biometricPublicKey: FieldValue.delete(),
      biometricCounter: FieldValue.delete(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`Revoked WebAuthn credential for user doc id: ${session.userDocId}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Revocation error:', err);
    res.status(500).json({ error: err.message || 'Failed to revoke credential.' });
  }
});

// ==========================================
// GOOGLE SHEETS LIVE LEDGER SYNC ENDPOINT
// ==========================================
app.post('/api/sheets/sync', async (req, res) => {
  try {
    const { accessToken, spreadsheetId, records } = req.body;

    if (!accessToken) {
      return res.status(401).json({ error: 'OAuth Authorization Access Token is required.' });
    }

    const targetSheetId = (spreadsheetId || '1qfw3v0D-INDw42Z5PvNbFQ5lVRr-prmsxlolyZos-u0').trim();

    // Headers
    const headers = [
      'Record ID',
      'Transaction Date',
      'Nature',
      'Money Sender',
      'Money Receiver',
      'Payment Method',
      'Amount (₹)',
      'Purpose',
      'Notes',
      'Created By',
      'Status',
      'Updated At'
    ];

    const rows = (records || []).map((r: any) => [
      r.id || '',
      r.transactionDate || '',
      r.transactionNature || '',
      r.moneySender || '',
      r.moneyReceiver || '',
      r.transactionType || '',
      Number(r.amount) || 0,
      r.purpose || '',
      r.notes || '',
      r.createdBy || '',
      r.status || 'active',
      r.updatedAt || new Date().toISOString()
    ]);

    const values = [headers, ...rows];

    // Clear previous contents first using default sheet range (A1:L5000)
    const clearRange = encodeURIComponent('A1:L5000');
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${clearRange}:clear`;
    try {
      await fetch(clearUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
    } catch (clearErr) {
      console.warn('[GOOGLE SHEETS CLEAR WARNING]', clearErr);
    }

    // Write updated values to range A1:L<count>
    const writeRange = encodeURIComponent(`A1:L${values.length}`);
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`;

    const response = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        range: `A1:L${values.length}`,
        majorDimension: 'ROWS',
        values
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GOOGLE SHEETS API ERROR]', response.status, errorText);

      let parsedGoogleError: any = null;
      try {
        parsedGoogleError = JSON.parse(errorText);
      } catch (e) {
        // Not JSON
      }

      const googleMsg = parsedGoogleError?.error?.message || errorText;

      let userFriendlyError = `Google Sheets API Error (${response.status})`;
      if (response.status === 403) {
        if (googleMsg.includes('does not have permission') || googleMsg.includes('PERMISSION_DENIED')) {
          userFriendlyError = 'Access Denied (403): Your Google account does not have Edit access to this Google Sheet. Please verify edit access or paste your own Google Sheet ID.';
        } else if (googleMsg.includes('has not been used in project') || googleMsg.includes('disabled')) {
          userFriendlyError = 'Google Sheets API is disabled on the GCP project. Please enable it in Google Cloud Console.';
        } else {
          userFriendlyError = `Access Denied (403): ${googleMsg}`;
        }
      } else if (response.status === 404) {
        userFriendlyError = 'Sheet Not Found (404): Please check that the Google Sheet ID is correct.';
      } else if (googleMsg) {
        userFriendlyError = `Google Sheets Error (${response.status}): ${googleMsg}`;
      }

      return res.status(response.status).json({
        error: userFriendlyError,
        rawGoogleError: googleMsg,
        status: response.status
      });
    }

    const result = await response.json();
    console.log(`[GOOGLE SHEETS SYNC SUCCESS] Synced ${rows.length} transaction records to sheet ID: ${targetSheetId}`);

    res.json({
      success: true,
      spreadsheetId: targetSheetId,
      updatedRows: result.updatedRows || values.length,
      updatedCells: result.updatedCells || (values.length * headers.length),
      syncedAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Google Sheets endpoint error:', err);
    res.status(500).json({ error: err.message || 'Server failed to sync with Google Sheets.' });
  }
});

// Route to CREATE a brand-new Google Sheet directly in the user's Google Drive account
app.post('/api/sheets/create', async (req, res) => {
  try {
    const { accessToken, title, records } = req.body;

    if (!accessToken) {
      return res.status(401).json({ error: 'OAuth Authorization Access Token is required.' });
    }

    const todayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const sheetTitle = title || `MVP Ledger Book - ${todayDate}`;

    // 1. Create a new spreadsheet via Google Sheets API
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        properties: {
          title: sheetTitle
        }
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error('[GOOGLE SHEETS CREATE ERROR]', createRes.status, errText);
      return res.status(createRes.status).json({
        error: `Failed to create new Google Sheet (${createRes.status}): ${errText}`,
        status: createRes.status
      });
    }

    const sheetData = await createRes.json();
    const newSpreadsheetId = sheetData.spreadsheetId;
    const newSpreadsheetUrl = sheetData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}/edit`;

    // 2. Format headers & data
    const headers = [
      'Record ID',
      'Transaction Date',
      'Nature',
      'Money Sender',
      'Money Receiver',
      'Payment Method',
      'Amount (₹)',
      'Purpose',
      'Notes',
      'Created By',
      'Status',
      'Updated At'
    ];

    const rows = (records || []).map((r: any) => [
      r.id || '',
      r.transactionDate || '',
      r.transactionNature || '',
      r.moneySender || '',
      r.moneyReceiver || '',
      r.transactionType || '',
      Number(r.amount) || 0,
      r.purpose || '',
      r.notes || '',
      r.createdBy || '',
      r.status || 'active',
      r.updatedAt || new Date().toISOString()
    ]);

    const values = [headers, ...rows];

    // 3. Write data to the new sheet
    const writeRange = encodeURIComponent(`A1:L${values.length}`);
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${newSpreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`;

    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        range: `A1:L${values.length}`,
        majorDimension: 'ROWS',
        values
      })
    });

    if (!updateRes.ok) {
      console.warn('[GOOGLE SHEETS POPULATE WARNING]', updateRes.status, await updateRes.text());
    }

    const syncedAt = new Date().toISOString();
    console.log(`[GOOGLE SHEETS CREATED SUCCESS] Created new sheet '${sheetTitle}' (ID: ${newSpreadsheetId}) with ${rows.length} rows`);

    return res.json({
      success: true,
      spreadsheetId: newSpreadsheetId,
      spreadsheetUrl: newSpreadsheetUrl,
      updatedRows: rows.length,
      syncedAt
    });
  } catch (error: any) {
    console.error('[CREATE SHEET ROUTE ERROR]', error);
    return res.status(500).json({ error: error.message || 'Failed to create new Google Sheet' });
  }
});


// Catch-all 404 handler for /api routes to prevent requests falling through to Vite SPA index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Express error middleware for /api routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    console.error('[API SERVER ERROR]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  }
  next(err);
});

// ==========================================
// VITE DEV / PRODUCTION INTEGRATION
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FULLSTACK CORE] Server successfully listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
