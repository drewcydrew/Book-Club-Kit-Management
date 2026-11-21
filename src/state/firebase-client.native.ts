import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { firebaseApp } from './firebase-app';

export function createAuth() {
  const { app, existing } = firebaseApp();
  if (existing) return getAuth(app);
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}
