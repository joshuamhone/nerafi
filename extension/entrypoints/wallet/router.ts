export type Route = 'overview' | 'activity' | 'send' | 'receive' | 'settings';

export const DEFAULT_ROUTE: Route = 'overview';

export const ACTIVITY_DETAIL_PATTERN = /^\/activity\/(0x[0-9a-fA-F]{64})$/;

export function parseRoute(hash: string): Route {
  let value = hash.trim();
  if (value.startsWith('#')) value = value.slice(1);
  value = value.trim();
  if (value === '/send' || value === 'send') return 'send';
  if (value === '/receive' || value === 'receive') return 'receive';
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