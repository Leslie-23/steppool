import { Platform } from 'react-native';

import { api } from './api';

// Google OAuth client ids from Google Cloud (APIs & Services → Credentials). The iOS one also needs
// GOOGLE_IOS_URL_SCHEME at build time (see app.config.js). The web one is what Android ID tokens carry.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export const googleEnabled = Platform.OS === 'ios' ? !!GOOGLE_IOS_CLIENT_ID : Platform.OS === 'android' ? !!GOOGLE_WEB_CLIENT_ID : false;

/** Thrown when the person backs out of the sheet: not an error worth showing. */
export class Cancelled extends Error {}

export async function appleAvailable() {
  if (Platform.OS !== 'ios') return false;
  const Apple = await import('expo-apple-authentication');
  return Apple.isAvailableAsync();
}

export async function signInWithApple() {
  const Apple = await import('expo-apple-authentication');
  try {
    const cred = await Apple.signInAsync({ requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL] });
    if (!cred.identityToken) throw new Error('Apple did not return a sign-in token');
    // Apple only shares the name on the very first sign-in; pass it so the server can keep it.
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
    return await api.appleSignIn(cred.identityToken, name);
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Cancelled();
    throw e;
  }
}

let googleConfigured = false;

export async function signInWithGoogle() {
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = await import('@react-native-google-signin/google-signin');
  if (!googleConfigured) {
    GoogleSignin.configure({ iosClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID });
    googleConfigured = true;
  }
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) throw new Cancelled();
    if (!res.data.idToken) throw new Error('Google did not return a sign-in token');
    return await api.googleSignIn(res.data.idToken);
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) throw new Cancelled();
    throw e;
  }
}
