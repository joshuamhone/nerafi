import { appendSecurityLog } from './securityLog';
import { loadVault, saveVault } from './storage';
import { LockoutError, encryptVaultVerified, openVault } from './unlock';
import { VaultError, validatePassword } from './vault';

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

// Change the vault password. The current password is verified through openVault
// (so it counts toward the unlock backoff), the new password must meet the
// policy and differ, and the phrase is re-encrypted with a fresh salt and IV
// that is verified to round-trip before the old vault is replaced. The stored
// address hint is left exactly as it was, so changing the password cannot move
// the hint (which names the active account) to another account.
export async function changePassword(
  current: string,
  next: string,
  confirm: string,
  now: number = Date.now(),
): Promise<ChangePasswordResult> {
  const policyError = validatePassword(next);
  if (policyError !== null) return { ok: false, error: policyError };
  if (next !== confirm) return { ok: false, error: 'Passwords do not match.' };
  if (next === current) {
    return { ok: false, error: 'Choose a password different from the current one.' };
  }

  let phrase: string;
  try {
    phrase = await openVault(current, now);
  } catch (err) {
    if (err instanceof LockoutError) {
      return { ok: false, error: 'Too many attempts. Try again in a while.' };
    }
    return { ok: false, error: err instanceof VaultError ? err.message : 'Incorrect password.' };
  }

  try {
    const loaded = await loadVault();
    if (loaded === null) {
      return { ok: false, error: 'Could not change the password. The old password still works.' };
    }
    const vault = await encryptVaultVerified(phrase, next);
    await saveVault(vault, loaded.address);
    await appendSecurityLog('password_changed', undefined, now);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not change the password. The old password still works.' };
  }
}
