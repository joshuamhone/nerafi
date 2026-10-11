import type { ReactNode } from 'react';
import './Notice.css';

type NoticeProps = {
  children: ReactNode;
  variant?: 'info' | 'alert';
  onPaper?: boolean;
};

export function Notice({ children, variant = 'info', onPaper = false }: NoticeProps) {
  const classes = ['notice', `notice--${variant}`];
  if (onPaper) classes.push('notice--paper');
  return (
    <div className={classes.join(' ')} role={variant === 'alert' ? 'alert' : undefined}>
      {children}
    </div>
  );
}
