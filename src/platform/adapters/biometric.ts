import { can } from '../capabilities';

/**
 * Biometric unlock.
 *
 * The web build uses WebAuthn with a platform authenticator. That is not an
 * option inside the native shell: `tauri.localhost` is not a secure context on
 * Android, and on iOS a WebAuthn relying-party id has to be a real associated
 * domain. Native hosts therefore go through the OS biometric prompt directly.
 *
 * The native prompt has no credential to enrol, so registration returns a
 * marker id. Callers must treat the returned id as opaque.
 */
const NATIVE_CREDENTIAL_ID = 'native-biometric';

export const isBiometricAvailable = async (): Promise<boolean> => {
  if (!can('biometric')) {
    const { isBiometricAvailable: webCheck } = await import(
      '@services/app_lock/webauthn'
    );
    return webCheck();
  }

  try {
    const { checkStatus } = await import('@tauri-apps/plugin-biometric');
    const status = await checkStatus();
    return status.isAvailable;
  } catch {
    return false;
  }
};

export const registerBiometric = async (
  userId: string,
  userName: string,
  displayName: string
): Promise<{ credentialId: string }> => {
  if (!can('biometric')) {
    const { registerBiometric: webRegister } = await import(
      '@services/app_lock/webauthn'
    );
    return webRegister(userId, userName, displayName);
  }

  // Enrolling means proving the user can pass the prompt right now; if they
  // cannot, enabling the toggle would lock them out of their own device.
  const passed = await verifyBiometric(NATIVE_CREDENTIAL_ID);

  if (!passed) {
    throw new Error('Biometric registration was cancelled');
  }

  return { credentialId: NATIVE_CREDENTIAL_ID };
};

export const verifyBiometric = async (
  credentialId: string
): Promise<boolean> => {
  if (!can('biometric')) {
    const { verifyBiometric: webVerify } = await import(
      '@services/app_lock/webauthn'
    );
    return webVerify(credentialId);
  }

  try {
    const { authenticate } = await import('@tauri-apps/plugin-biometric');

    await authenticate('Unlock Organized', {
      // the PIN screen stays reachable behind the prompt, so the OS fallback
      // would only duplicate it
      allowDeviceCredential: false,
      cancelTitle: 'Use PIN',
    });

    return true;
  } catch {
    // cancelled, locked out, or no enrolled biometrics — the caller falls
    // back to the PIN screen
    return false;
  }
};
