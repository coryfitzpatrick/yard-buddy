// lib/biometric/store.ts
//
// Thin abstraction over @capgo/capacitor-native-biometric. Stores a
// server-issued refresh token (NOT a session JWT) in OS-level secure storage
// (iOS Keychain / Android Keystore + EncryptedSharedPreferences) with a
// hardware-backed biometric gate on reads.
//
// Security model: credentials are written with
// AccessControl.BIOMETRY_CURRENT_SET, which means
//   - iOS:     Keychain item is tagged with kSecAccessControlBiometryCurrentSet,
//              so the OS itself surfaces the biometric prompt on read and the
//              item is invalidated if the user re-enrolls a face/fingerprint.
//   - Android: Keystore key has setUserAuthenticationRequired(true) and the
//              plugin shows BiometricPrompt with a CryptoObject bound to the
//              decryption key. JS cannot bypass this gate.
// We read with getSecureCredentials() (NOT getCredentials()), which is the
// biometric-gated retrieval path. No separate JS-side authenticate() call is
// needed -- the prompt is part of the OS read.
//
// Methods only run in the Capacitor app context; callers should gate on
// isMobileAppClient() before invoking.

const SERVER_KEY = "yardanalyzer.biometric.refresh";
const USERNAME_SENTINEL = "refresh"; // Capgo stores {username,password}; we
                                     // only need one secret, so the token
                                     // goes in `password` under a fixed name.

export interface BiometricStore {
  isAvailable(): Promise<boolean>;
  storeRefreshToken(token: string): Promise<void>;
  unlockRefreshToken(): Promise<string | null>;
  clear(): Promise<void>;
}

export async function getBiometricStore(): Promise<BiometricStore> {
  const { NativeBiometric, AccessControl } = await import(
    "@capgo/capacitor-native-biometric"
  );

  return {
    async isAvailable() {
      try {
        const r = await NativeBiometric.isAvailable({ useFallback: false });
        return r.isAvailable;
      } catch {
        return false;
      }
    },
    async storeRefreshToken(token: string) {
      // BIOMETRY_CURRENT_SET binds the stored credential to the current
      // biometric enrollment -- re-enrolling invalidates it, forcing a
      // password sign-in (which is the desired behavior).
      await NativeBiometric.setCredentials({
        server: SERVER_KEY,
        username: USERNAME_SENTINEL,
        password: token,
        accessControl: AccessControl.BIOMETRY_CURRENT_SET,
      });
    },
    async unlockRefreshToken() {
      try {
        // Biometric prompt is shown by the OS as part of this read. Throws
        // on cancel/fail/no-credential; caught below and surfaced as null
        // so callers fall through to the password login flow.
        const creds = await NativeBiometric.getSecureCredentials({
          server: SERVER_KEY,
          reason: "Sign in to Yard Analyzer",
          title: "Unlock Yard Analyzer",
          negativeButtonText: "Use Password",
        });
        return creds.password ?? null;
      } catch {
        return null;
      }
    },
    async clear() {
      try {
        await NativeBiometric.deleteCredentials({ server: SERVER_KEY });
      } catch {
        /* no-op if nothing stored */
      }
    },
  };
}
