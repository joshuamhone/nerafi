import { diffAddress } from '../lib/wallet/lookalike';
import './AddressText.css';

type AddressTextProps = {
  value: string;
  /** "address" alternates chunk colours; "hash" keeps one colour. */
  variant?: 'address' | 'hash';
  /** Use the paper-safe palette (paper-ink / intaglio-strong). */
  onPaper?: boolean;
  /** Mark the characters of `value` that differ from this address. */
  compareTo?: string;
  className?: string;
};

type ChunkSpec = {
  text: string;
  /** Index of this chunk's first character within the 40 hex characters, or
   * null for the "0x" prefix. */
  bodyStart: number | null;
};

function chunkSpec(value: string): ChunkSpec[] {
  const lower = value.toLowerCase();
  const hasPrefix = lower.startsWith('0x');
  const body = hasPrefix ? value.slice(2) : value;
  const specs: ChunkSpec[] = [];
  if (hasPrefix) specs.push({ text: value.slice(0, 2), bodyStart: null });
  for (let i = 0; i < body.length; i += 4) {
    specs.push({ text: body.slice(i, i + 4), bodyStart: i });
  }
  return specs;
}

export function AddressText({
  value,
  variant = 'address',
  onPaper = false,
  compareTo,
  className,
}: AddressTextProps) {
  const specs = chunkSpec(value);
  const classes = ['addr'];
  if (variant === 'hash') classes.push('addr--hash');
  if (onPaper) classes.push('on-paper');
  if (className) classes.push(className);
  const alternate = variant === 'address';
  const diff = compareTo === undefined ? null : diffAddress(value, compareTo);

  return (
    <span className={classes.join(' ')}>
      <span className="visually-hidden">{value}</span>
      <span className="addr-visual" aria-hidden="true">
        {specs.map((spec, i) => {
          const chunkClasses = ['addr-chunk'];
          if (alternate && i % 2 === 1) chunkClasses.push('addr-chunk--alt');
          const bodyStart = spec.bodyStart;
          if (diff === null || bodyStart === null) {
            return (
              <span key={i} className={chunkClasses.join(' ')}>
                {spec.text}
              </span>
            );
          }
          return (
            <span key={i} className={chunkClasses.join(' ')}>
              {spec.text.split('').map((char, j) => {
                const isDiff = diff[bodyStart + j] === true;
                return (
                  <span
                    key={j}
                    className={isDiff ? 'addr-char addr-char--diff' : 'addr-char'}
                  >
                    {char}
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    </span>
  );
}
