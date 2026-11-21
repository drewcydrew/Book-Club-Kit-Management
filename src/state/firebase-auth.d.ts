import type { Persistence } from 'firebase/auth';
import type AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase's default TypeScript entry omits this React Native runtime export.
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
}
