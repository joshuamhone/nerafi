import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import './Field.css';

type ShellProps = {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
};

function FieldShell({ label, htmlFor, hint, error, trailing, children }: ShellProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="field-control">
        {children}
        {trailing}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  trailing?: ReactNode;
  mono?: boolean;
};

export function Field({
  id,
  label,
  hint,
  error,
  trailing,
  mono = false,
  className,
  ...rest
}: FieldProps) {
  const inputClass = mono ? 'field-input field-input--mono' : 'field-input';
  const classes = className ? `${inputClass} ${className}` : inputClass;
  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} trailing={trailing}>
      <input id={id} className={classes} {...rest} />
    </FieldShell>
  );
}

export type TextareaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function TextareaField({
  id,
  label,
  hint,
  error,
  className,
  ...rest
}: TextareaFieldProps) {
  const classes = className ? `field-input field-input--area ${className}` : 'field-input field-input--area';
  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error}>
      <textarea id={id} className={classes} {...rest} />
    </FieldShell>
  );
}
