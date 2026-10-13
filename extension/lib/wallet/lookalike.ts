export type KnownAddressKind = 'account' | 'contact' | 'sent';

export type KnownAddress = {
  address: string;
  label: string;
  kind: KnownAddressKind;
};

export type LookalikeMatch = {
  known: KnownAddress;
  prefixMatch: number;
  suffixMatch: number;
};

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

// Detect only on the canonical 40-hex-character form, so a malformed string is
// never compared. Matching is case-insensitive.
function hexBody(address: string): string | null {
  const trimmed = address.trim();
  if (!ADDRESS_PATTERN.test(trimmed)) return null;
  return trimmed.slice(2).toLowerCase();
}

type MatchLengths = { prefixMatch: number; suffixMatch: number };

function matchLengths(a: string, b: string): MatchLengths {
  const length = Math.min(a.length, b.length);
  let prefixMatch = 0;
  while (prefixMatch < length && a.charAt(prefixMatch) === b.charAt(prefixMatch)) {
    prefixMatch += 1;
  }
  let suffixMatch = 0;
  while (
    suffixMatch < length - prefixMatch &&
    a.charAt(a.length - 1 - suffixMatch) === b.charAt(b.length - 1 - suffixMatch)
  ) {
    suffixMatch += 1;
  }
  return { prefixMatch, suffixMatch };
}

function isLookalikeMatch(prefixMatch: number, suffixMatch: number): boolean {
  // 3+3 is already about 1 in 16.8 million for random addresses; a run of five
  // at either end is about 1 in 524,000 per comparison. Being generous here is
  // deliberate: a false positive only asks the user to look again.
  if (prefixMatch >= 3 && suffixMatch >= 3) return true;
  if (prefixMatch >= 5) return true;
  if (suffixMatch >= 5) return true;
  return false;
}

export function isLookalike(a: string, b: string): boolean {
  const left = hexBody(a);
  const right = hexBody(b);
  if (left === null || right === null) return false;
  if (left === right) return false;
  const { prefixMatch, suffixMatch } = matchLengths(left, right);
  return isLookalikeMatch(prefixMatch, suffixMatch);
}

export function findLookalike(candidate: string, known: KnownAddress[]): LookalikeMatch | null {
  const candidateBody = hexBody(candidate);
  if (candidateBody === null) return null;

  let best: LookalikeMatch | null = null;
  let bestScore = -1;
  for (const entry of known) {
    const knownBody = hexBody(entry.address);
    if (knownBody === null) continue;
    if (knownBody === candidateBody) continue;
    const { prefixMatch, suffixMatch } = matchLengths(candidateBody, knownBody);
    if (!isLookalikeMatch(prefixMatch, suffixMatch)) continue;
    const score = prefixMatch + suffixMatch;
    if (score > bestScore) {
      bestScore = score;
      best = { known: entry, prefixMatch, suffixMatch };
    }
  }
  return best;
}

// One flag per hex character of `a` (the 40 characters after "0x"): true means
// that character differs from `b`. Used to mark differing characters in the UI
// without relying on colour alone.
export function diffAddress(a: string, b: string): boolean[] {
  const left = hexBody(a);
  const right = hexBody(b);
  if (left === null || right === null || left.length !== right.length) {
    const length = left?.length ?? 0;
    return Array.from({ length }, () => true);
  }
  return left.split('').map((char, index) => char !== right.charAt(index));
}
