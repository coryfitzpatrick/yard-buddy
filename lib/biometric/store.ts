// lib/biometric/store.ts
//
// Thin abstraction over @aparajita/capacitor-biometric-auth. Stores a
// server-issued refresh token (NOT a session JWT) and gates retrieval on a
// biometric prompt. Methods only run in the Capacitor app context; callers
// should gate on isMobileAppClient() before invoking.
//
// Note on the underlying primitive: the @aparajita plugin only exposes the
// biometric prompt itself (checkBiometry/authenticate), not a Keychain
// wrapper. Storage therefore goes through @capacitor/preferences, which is
// backed by NSUserDefaults on iOS and SharedPreferences on Android. The
// biometric gate is enforced by requiring a successful authenticate() call
// before unlockRefreshToken() returns the stored value. If a future plugin
// version (or a separate plugin) exposes Keychain ItemAccessibility
// flags directly, swap the storage backend here -- the interface stays.

const PREFS_KEY = "yardanalyzer.biometric.refresh";

export interface BiometricStore {
  isAvailable(): Promise<boolean>;
  storeRefreshToken(token: string): Promise<void>;
  unlockRefreshToken(): Promise<string | null>;
  clear(): Promise<void>;
}

export async function getBiometricStore(): Promise<BiometricStore> {
  const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
  const { Preferences } = await import("@capacitor/preferences");

  return {
    async isAvailable() {
      try {
        const r = await BiometricAuth.checkBiometry();
        return r.isAvailable;
      } catch {
        return false;
      }
    },
    async storeRefreshToken(token: string) {
      await Preferences.set({ key: PREFS_KEY, value: token });
    },
    async unlockRefreshToken() {
      try {
        // Throws BiometryError on cancel/fail; caught below.
        await BiometricAuth.authenticate({
          reason: "Sign in to Yard Analyzer",
          cancelTitle: "Use Password",
          allowDeviceCredential: false,
        });
        const { value } = await Preferences.get({ key: PREFS_KEY });
        return value ?? null;
      } catch {
        return null;
      }
    },
    async clear() {
      try {
        await Preferences.remove({ key: PREFS_KEY });
      } catch {
        /* no-op if nothing stored */
      }
    },
  };
}
