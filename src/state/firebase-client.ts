import { getAuth } from 'firebase/auth';
import { firebaseApp } from './firebase-app';

export function createAuth() {
  return getAuth(firebaseApp().app);
}
