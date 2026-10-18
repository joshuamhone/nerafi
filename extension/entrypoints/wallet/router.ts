export type Route =
  | 'overview'
  | 'activity'
  | 'send'
  | 'receive'
  | 'contacts'
  | 'approvals'
  | 'security'
  | 'settings';

export const DEFAULT_ROUTE: Route = 'overview';

export const ACTIVITY_DETAIL_PATTERN = /^\/activity\/(0x[0-9a-fA-F]{64})$/;

export function parseRoute(hash: string): Route {
  let value = hash.trim();
  if (value.startsWith('#')) value = value.slice(1);
  value = value.trim();
  if (value === '/send' || value === 'send') return 'send';
  if (value === '/receive' || value === 'receive') return 'receive';
  if (value === '/contacts' || value === 'contacts') return 'contacts';
  if (value === '/approvals' || value === 'approvals') return 'approvals';
  if (value === '/security' || value === 'security') return 'security';
  if (value === '/settings' || value === 'settings') return 'settings';
  if (
    value === '/activity' ||
    value === 'activity' ||
    value.startsWith('/activity/') ||
    value.startsWith('activity/')
  ) {
    return 'activity';
  }
  return DEFAULT_ROUTE;
}

export function parseActivityId(hash: string): string | null {
  let value = hash.trim();
  if (value.startsWith('#')) value = value.slice(1);
  const match = ACTIVITY_DETAIL_PATTERN.exec(value);
  return match?.[1] ?? null;
}

export function activityHref(id: string): string {
  return `#/activity/${id}`;
}

export function routeHref(route: Route): string {
  return `#/${route}`;
}

// A detail link for one row. A transaction row is `#/activity/{hash}`; a
// transfer row adds which transfer inside that transaction it is, because one
// transaction can hold several.
export type ActivityRef =
  | { kind: 'transaction'; hash: string }
  | { kind: 'token' | 'internal'; hash: string; index: number };

export const ACTIVITY_REF_PATTERN =
  /^\/activity\/(0x[0-9a-fA-F]{64})(?:\/(token|internal)\/(\d{1,9}))?$/;

export function parseActivityRef(hash: string): ActivityRef | null {
  let value = hash.trim();
  if (value.startsWith('#')) value = value.slice(1);
  const match = ACTIVITY_REF_PATTERN.exec(value);
  if (match === null) return null;
  const txHash = match[1];
  if (txHash === undefined) return null;
  const kind = match[2];
  const index = match[3];
  if ((kind === 'token' || kind === 'internal') && index !== undefined) {
    return { kind, hash: txHash, index: Number(index) };
  }
  return { kind: 'transaction', hash: txHash };
}

export function activityRefHref(ref: ActivityRef): string {
  if (ref.kind === 'transaction') return activityHref(ref.hash);
  return `#/activity/${ref.hash}/${ref.kind}/${ref.index}`;
}
