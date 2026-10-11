import type { ComponentType } from 'react';
import { Button } from '../../../components/Button';
import {
  LockIcon,
  OverviewIcon,
  ReceiveIcon,
  SendIcon,
} from '../../../components/icons';
import type { IconProps } from '../../../components/icons';
import { Seal } from '../../../components/Seal';
import { useWallet } from '../context';
import type { Route } from '../router';
import { routeHref } from '../router';
import './Sidebar.css';

type SidebarProps = {
  route: Route;
  busy: boolean;
};

const NAV: Array<{ route: Route; label: string; Icon: ComponentType<IconProps> }> = [
  { route: 'overview', label: 'Overview', Icon: OverviewIcon },
  { route: 'send', label: 'Send', Icon: SendIcon },
  { route: 'receive', label: 'Receive', Icon: ReceiveIcon },
];

export function Sidebar({ route, busy }: SidebarProps) {
  const { network, refresh, lock } = useWallet();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Seal size={22} />
        <span className="sidebar-wordmark">Nerafi</span>
      </div>

      <div className="sidebar-account">
        <span className="sidebar-account-label">Account</span>
        <span className="sidebar-account-name">Account 1</span>
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {NAV.map(({ route: itemRoute, label, Icon }) => {
          const active = route === itemRoute;
          const classes = active ? 'sidebar-link sidebar-link--active' : 'sidebar-link';
          return (
            <a
              key={itemRoute}
              className={classes}
              href={routeHref(itemRoute)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={16} />
              <span>{label}</span>
            </a>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="net-status">
          <span
            className={
              network === 'reachable'
                ? 'net-dot net-dot--ok'
                : network === 'unreachable'
                  ? 'net-dot net-dot--alert'
                  : 'net-dot'
            }
            aria-hidden="true"
          />
          {network === 'reachable' && <span className="net-label">Sepolia testnet</span>}
          {network === 'checking' && <span className="net-label">Checking…</span>}
          {network === 'unreachable' && (
            <span className="net-detail">
              <span className="net-label">Network unreachable</span>
              <button type="button" className="net-retry" onClick={refresh}>
                Retry
              </button>
            </span>
          )}
        </div>

        <Button
          variant="secondary"
          className="sidebar-lock"
          onClick={lock}
          disabled={busy}
        >
          <LockIcon size={14} />
          Lock
        </Button>

        <p className="sidebar-note">Testnet only. Not for real funds.</p>
      </div>
    </aside>
  );
}