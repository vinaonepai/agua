import { initializeApp, getApps } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

const app = hasFirebaseConfig ? getApps()[0] || initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

if (auth) {
  auth.languageCode = 'pt-BR';
  setPersistence(auth, browserLocalPersistence);
}

const removeLocalOnlyFields = (profile = {}) => {
  const firestoreProfile = { ...profile };
  delete firestoreProfile.uid;
  return firestoreProfile;
};
const ensureFirebase = () => {
  if (!auth || !db) {
    throw new Error('Firebase ainda nao configurado. Preencha o arquivo .env com as chaves do seu projeto.');
  }
};

const normalizeProfile = (profile = {}) => ({
  name: profile.name || '',
  phone: profile.phone || '',
  email: profile.email || '',
  company: profile.company || '',
  unit: profile.unit || '',
  role: profile.role || '',
  avatarColor: profile.avatarColor || '#1ca7a0',
  avatarImage: profile.avatarImage || '',
  emailAlerts: profile.emailAlerts ?? true,
  weeklyReport: profile.weeklyReport ?? true,
  reportFrequency: profile.reportFrequency || 'Semanal',
  theme: profile.theme === 'dark' || profile.theme === 'light' ? profile.theme : '',
  themeConfigured: profile.themeConfigured === true,
  emailVerified: profile.emailVerified ?? false,
  settings: profile.settings || null,
});

export const isFirebaseReady = () => hasFirebaseConfig;

export const getCurrentUser = () => auth?.currentUser || null;

export const getFirestoreDb = () => db;

export const waitForCurrentUser = () => {
  if (!auth) {
    return Promise.resolve(null);
  }

  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      resolve(user || null);
    });
  });
};

export const watchAuthUser = (callback) => {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
};

export const buildAccountFromUser = (user, extra = {}) => {
  const profile = normalizeProfile(extra);

  return {
    ...profile,
    uid: user.uid || profile.uid || '',
    name: profile.name || user.displayName || '',
    phone: profile.phone || user.phoneNumber || '',
    email: user.email || profile.email || '',
    avatarImage: profile.avatarImage || user.photoURL || '',
  };
};

export const isProfileComplete = (profile) => {
  return Boolean(profile?.name && profile?.email && profile?.phone && profile?.company && profile?.role);
};

export const getUserProfile = async (uid) => {
  ensureFirebase();
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? normalizeProfile(snapshot.data()) : null;
};

export const saveUserProfile = async (uid, profile) => {
  ensureFirebase();
  await setDoc(
    doc(db, 'users', uid),
    {
      ...removeLocalOnlyFields(profile),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const loadCurrentUserProfile = async () => {
  ensureFirebase();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return null;
  }

  const profile = await getUserProfile(currentUser.uid);
  return buildAccountFromUser(currentUser, profile || {});
};

export const syncCurrentUserProfile = async (profile) => {
  ensureFirebase();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return null;
  }

  const nextProfile = buildAccountFromUser(currentUser, profile);
  await saveUserProfile(currentUser.uid, normalizeProfile(nextProfile));
  return nextProfile;
};

export const loginWithEmail = async (email, password) => {
  ensureFirebase();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await reload(credential.user);
  const profile = await getUserProfile(credential.user.uid);
  return buildAccountFromUser(credential.user, profile || {});
};

export const createFirebaseAccount = async ({ name, email, password, phone, company, unit, role, avatarColor, avatarImage, settings, theme, themeConfigured = true, useCurrentUser = false }) => {
  ensureFirebase();
  const currentUser = auth.currentUser;
  const isGoogleUser = currentUser?.providerData.some((provider) => provider.providerId === 'google.com');
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const currentUserEmail = String(currentUser?.email || '').trim().toLowerCase();
  const canUseCurrentUser = useCurrentUser && isGoogleUser && currentUserEmail === normalizedEmail;
  const credential = canUseCurrentUser ? { user: currentUser } : await createUserWithEmailAndPassword(auth, email, password);

  if (credential.user.displayName !== name) {
    await updateProfile(credential.user, { displayName: name });
  }

  const profile = buildAccountFromUser(credential.user, {
    name,
    phone,
    company,
    unit,
    role,
    avatarColor,
    avatarImage,
    theme,
    themeConfigured,
    emailVerified: false,
    settings,
  });

  await saveUserProfile(credential.user.uid, {
    ...profile,
    createdAt: serverTimestamp(),
  });

  return profile;
};

export const loginWithGoogle = async () => {
  ensureFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const credential = await signInWithPopup(auth, provider);
  await reload(credential.user);
  const storedProfile = await getUserProfile(credential.user.uid);
  const profile = buildAccountFromUser(credential.user, storedProfile || {});

  return {
    account: profile,
    profileComplete: isProfileComplete(storedProfile),
  };
};

export const sendCurrentEmailVerification = async () => {
  ensureFirebase();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Entre na conta antes de solicitar a verificacao.');
  }

  if (currentUser.emailVerified) {
    return {
      alreadyVerifiedByFirebase: true,
      sent: false,
      providers: currentUser.providerData.map((provider) => provider.providerId),
    };
  }

  await sendEmailVerification(currentUser, {
    handleCodeInApp: false,
    url: `${window.location.origin}${window.location.pathname}`,
  });

  return {
    alreadyVerifiedByFirebase: false,
    sent: true,
    providers: currentUser.providerData.map((provider) => provider.providerId),
  };
};

export const refreshCurrentUser = async () => {
  ensureFirebase();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return false;
  }

  await reload(currentUser);
  return currentUser.emailVerified;
};

export const getCurrentProviderIds = () => {
  return auth?.currentUser?.providerData.map((provider) => provider.providerId) || [];
};

export const confirmCurrentGoogleAccount = async () => {
  ensureFirebase();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Entre na conta antes de confirmar o Google.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await reauthenticateWithPopup(currentUser, provider);

  return credential.user.uid === currentUser.uid && credential.user.email === currentUser.email;
};

export const logoutFirebase = async () => {
  if (auth) {
    await signOut(auth);
  }
};

export const deleteFirebaseAccount = async () => {
  ensureFirebase();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return;
  }

  await deleteDoc(doc(db, 'users', currentUser.uid));
  await deleteUser(currentUser);
};

