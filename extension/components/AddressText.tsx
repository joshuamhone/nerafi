import './AddressText.css';

type AddressTextProps = {
  value: string;
  /** "address" alternates chunk colours; "hash" keeps one colour. */
  variant?: 'address' | 'hash';
  /** Use the paper-safe palette (paper-ink / intaglio-strong). */
  onPaper?: boolean;
  className?: string;
};

function chunk(value: string): string[] {
  const lower = value.toLowerCase();
  const hasPrefix = lower.startsWith('0x');
  const prefix = hasPrefix ? value.slice(0, 2) : '';
  const body = hasPrefix ? value.slice(2) : value;
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += 4) {
    groups.push(body.slice(i, i + 4));
  }
  return prefix ? [prefix, ...groups] : groups;
}

export function AddressText({
  value,
  variant = 'address',
  onPaper = false,
  className,
}: AddressTextProps) {
  const chunks = chunk(value);
  const classes = ['addr'];
  if (variant === 'hash') classes.push('addr--hash');
  if (onPaper) classes.push('on-paper');
  if (className) classes.push(className);
  const alternate = variant === 'address';

  return (
    <span className={classes.join(' ')}>
      <span className="visually-hidden">{value}</span>
      <span className="addr-visual" aria-hidden="true">
        {chunks.map((part, i) => (
          <span
            key={i}
            className={alternate && i % 2 === 1 ? 'addr-chunk addr-chunk--alt' : 'addr-chunk'}
          >
            {part}
          </span>
        ))}
      </span>
    </span>
  );
}
