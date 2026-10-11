import { Guilloche } from './Guilloche';
import './Seal.css';

type SealProps = {
  size?: number;
  className?: string;
};

export function Seal({ size = 24, className }: SealProps) {
  const classes = ['seal'];
  if (className) classes.push(className);
  return (
    <span
      className={classes.join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Guilloche variant="ring" />
    </span>
  );
}
