import type { ButtonHTMLAttributes } from 'react';
import './Button.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
  /** Use the paper palette (only the cheque does this). */
  onPaper?: boolean;
};

export function Button({
  variant = 'secondary',
  onPaper = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`];
  if (onPaper) classes.push('btn--paper');
  if (className) classes.push(className);

  return <button type={type} className={classes.join(' ')} {...rest} />;
}
