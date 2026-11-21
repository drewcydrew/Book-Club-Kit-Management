import { getApps, initializeApp } from 'firebase/app';

export function firebaseApp() {
  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error('Firebase sign-in is not configured.');
  }
  const existing = getApps().find((item) => item.name === 'book-club');
  return { app: existing || initializeApp(config, 'book-club'), existing: !!existing };
}
