import type { ReactNode } from 'react';
import { Guilloche } from '../../components/Guilloche';
import './AuthLayout.css';

type AuthLayoutProps = {
  children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <div className="auth-brand">
        <span className="auth-seal" aria-hidden="true">
          <Guilloche variant="ring" />
        </span>
        <span className="auth-brand-name">Nerafi</span>
        <p className="auth-tagline">Understand before you sign.</p>
      </div>
      <div className="auth-task">
        <div className="auth-task-inner">{children}</div>
      </div>
    </div>
  );
}