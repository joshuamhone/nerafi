import type { ReactNode } from 'react';
import type { Route } from '../router';
import { Sidebar } from './Sidebar';
import './AppShell.css';

type AppShellProps = {
  route: Route;
  busy: boolean;
  children: ReactNode;
};

export function AppShell({ route, busy, children }: AppShellProps) {
  return (
    <div className="shell">
      <Sidebar route={route} busy={busy} />
      <main className="shell-main">
        <div className="shell-main-inner">{children}</div>
      </main>
    </div>
  );
}