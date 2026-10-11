export type Route = 'overview' | 'send' | 'receive';

export const DEFAULT_ROUTE: Route = 'overview';

export function parseRoute(hash: string): Route {
  let value = hash.trim();
  if (value.startsWith('#')) value = value.slice(1);
  value = value.trim();
  if (value === '/send' || value === 'send') return 'send';
  if (value === '/receive' || value === 'receive') return 'receive';
  return DEFAULT_ROUTE;
}

export function routeHref(route: Route): string {
  return `#/${route}`;
}