import type { FeedItem } from '../history/types';
import { isNativeEthLog, isTokenItem } from '../history/types';
import type { KnownAddress } from '../lookalike';
import { activityCounterpartyInfo } from '../recipientSafety';
import type { SecurityLogEntry } from '../securityLog';
import { sameSymbolAddresses } from '../tokens';
import type { Token } from '../tokens';
import { sortFindings } from './types';
import type { Finding } from './types';

// Wallet-level checks. Pure: they read only state that is already loaded and
// make no network call. Every threshold is a heuristic, not a validated limit.

// Heuristic: an auto-lock longer than 30 minutes leaves an unlocked wallet open
// for a long time if the computer is left alone.
export const AUTO_LOCK_LONG_MINUTES = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

// Heuristic: one or two failed password attempts in a day is normal typing
// trouble (info); this many or more is worth a look (caution).
export const FAILED_UNLOCK_CAUTION_COUNT = 3;

export type ManifestLike = {
  permissions?: unknown;
  host_permissions?: unknown;
};

export type PostureInput = {
  autoLockMinutes: number;
  securityLog: SecurityLogEntry[];
  now: number;
  // Already-loaded Activity, or null when nothing has been loaded yet. The
  // history-based checks are skipped (and reported as such) when it is null.
  loadedActivity: FeedItem[] | null;
  known: KnownAddress[];
  tokens: Token[];
  manifest: ManifestLike;
};

export type PostureReport = {
  findings: Finding[];
  // Checks that did not run, and why, so the page never implies they passed.
  skipped: string[];
};

export const PERMISSIONS_OK_TEXT =
  'This extension can only use browser storage. It has no access to websites.';
export const PERMISSIONS_SELF_REPORT_TEXT =
  'This comes from the extension reporting on itself. It is not independent proof.';

export const DEV_BUILD_NOTE =
  'Development builds add extra permissions. If you are running a build made with the development server, this is expected; check a production build.';

// Shown under the permissions finding when it fails. It does not change the
// finding's severity.
export function devBuildNoteFor(findings: Finding[]): string | null {
  return findings.some((finding) => finding.id === 'permissions_expanded')
    ? DEV_BUILD_NOTE
    : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// True only when the permission list is exactly ["storage"] and there is no
// host permission of any kind.
export function permissionsAreMinimal(manifest: ManifestLike): boolean {
  const permissions = manifest.permissions;
  if (!isStringArray(permissions)) return false;
  if (permissions.length !== 1 || permissions[0] !== 'storage') return false;
  const hosts = manifest.host_permissions;
  if (hosts === undefined) return true;
  return Array.isArray(hosts) && hosts.length === 0;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function countRecentFailedPasswordAttempts(
  log: SecurityLogEntry[],
  now: number,
): number {
  return log.filter((entry) => entry.type === 'unlock_failed' && now - entry.at <= DAY_MS)
    .length;
}

export function assessWallet(input: PostureInput): PostureReport {
  const findings: Finding[] = [];
  const skipped: string[] = [];

  if (input.autoLockMinutes > AUTO_LOCK_LONG_MINUTES) {
    findings.push({
      id: 'auto_lock_long',
      severity: 'caution',
      title: 'Auto-lock is set to a long time',
      explanation: `The wallet stays unlocked for ${input.autoLockMinutes} minutes after you unlock it. Anyone who sits at this computer in that time can use it.`,
      action: 'Choose a shorter auto-lock in Settings.',
    });
  }

  // The log records a failed attempt whenever a password is checked and is
  // wrong: at unlock, when sending, when adding an account and when changing the
  // password. So this counts failed password attempts, not only unlocks.
  const failed = countRecentFailedPasswordAttempts(input.securityLog, input.now);
  if (failed > 0) {
    const many = failed >= FAILED_UNLOCK_CAUTION_COUNT;
    findings.push({
      id: 'recent_failed_unlocks',
      severity: many ? 'caution' : 'info',
      title: `${failed} failed password ${plural(failed, 'attempt', 'attempts')} in the last 24 hours`,
      explanation: many
        ? 'Several wrong passwords were entered recently. That can be a typing problem or someone else trying.'
        : 'A wrong password was entered recently. This is usually a typing slip.',
      action: 'If you did not do this, lock the wallet and change your password in Settings.',
    });
  }

  if (input.loadedActivity === null) {
    skipped.push(
      'Checks on your activity did not run because Activity has not been loaded yet. Open Activity to load it.',
    );
  } else {
    // Native-ETH transfer logs are not tokens: they are left out of every count
    // below, even if one is passed in.
    const items = input.loadedActivity.filter((item) => !isNativeEthLog(item));

    const zeroValue = items.filter(
      (item) => isTokenItem(item) && item.direction === 'in' && item.value === 0n,
    ).length;
    if (zeroValue > 0) {
      findings.push({
        id: 'zero_value_inbound',
        severity: 'caution',
        title: `${zeroValue} incoming zero-value token ${plural(zeroValue, 'transfer', 'transfers')}`,
        explanation:
          'Someone sent you tokens worth nothing. Attackers use these to plant lookalike addresses in your history.',
        action: 'Never copy an address from your history. Use your address book instead.',
      });
    }

    const lookalikeSenders = new Set<string>();
    for (const item of items) {
      if (item.direction !== 'in') continue;
      if (activityCounterpartyInfo(item, input.known).poisoning !== null) {
        lookalikeSenders.add(item.from.toLowerCase());
      }
    }
    if (lookalikeSenders.size > 0) {
      const count = lookalikeSenders.size;
      findings.push({
        id: 'lookalike_senders',
        severity: 'caution',
        title: `${count} incoming ${plural(count, 'sender looks', 'senders look')} like an address you know`,
        explanation:
          'These addresses start and end like one of yours but are different. This is how address poisoning works.',
        action: 'Do not send to an address copied from your history.',
      });
    }

    const listed = new Set(input.tokens.map((token) => token.address.toLowerCase()));
    const unlisted = new Set<string>();
    for (const item of items) {
      if (!isTokenItem(item)) continue;
      if (item.direction !== 'in') continue;
      const address = item.tokenAddress.toLowerCase();
      if (!listed.has(address)) unlisted.add(address);
    }
    if (unlisted.size > 0) {
      const count = unlisted.size;
      findings.push({
        id: 'unlisted_tokens_received',
        severity: 'info',
        title: `${count} unlisted ${plural(count, 'token has', 'tokens have')} sent to you`,
        explanation:
          'Anyone can send you a token with any name. These are not in your token list and Nerafi has not checked them.',
        action: 'Ignore them unless you know the token and add it yourself by its contract address.',
      });
    }
  }

  const clashing = sameSymbolAddresses(input.tokens).size;
  if (clashing > 0) {
    findings.push({
      id: 'token_symbol_clash',
      severity: 'caution',
      title: `${clashing} listed tokens share a symbol`,
      explanation:
        'Two tokens in your list use the same symbol. Only the contract address tells them apart.',
      action: 'Check the contract address of each one in your token list.',
    });
  }

  if (permissionsAreMinimal(input.manifest)) {
    findings.push({
      id: 'permissions_minimal',
      severity: 'info',
      title: 'Extension permissions',
      explanation: PERMISSIONS_OK_TEXT,
      action: 'Nothing to do.',
    });
  } else {
    findings.push({
      id: 'permissions_expanded',
      severity: 'danger',
      title: 'This extension has more permissions than expected',
      explanation:
        'Nerafi is built to use only browser storage and no website access, but the installed extension reports something different.',
      action:
        'Do not use this wallet for anything you care about. Reinstall it from your own build.',
    });
  }

  return { findings: sortFindings(findings), skipped };
}
