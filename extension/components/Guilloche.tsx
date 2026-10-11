import './Guilloche.css';

type GuillocheProps = {
  variant?: 'band' | 'band-v' | 'ring';
  className?: string;
};

function waveLines(vertical: boolean, lines: number): string[] {
  const span = 600;
  const thickness = 40;
  const mid = thickness / 2;
  const steps = 300;
  const out: string[] = [];
  for (let l = 0; l < lines; l++) {
    const phase = (l / lines) * Math.PI * 2;
    const amp = mid * (0.35 + 0.45 * (l / Math.max(1, lines - 1)));
    const period = span / (2 + (l % 4));
    let path = '';
    for (let i = 0; i <= steps; i++) {
      const along = (i / steps) * span;
      const offset =
        mid +
        amp *
          Math.sin((along / period) * Math.PI * 2 + phase) *
          Math.cos((along / (period * 1.6)) * Math.PI + phase / 2);
      const x = vertical ? offset : along;
      const y = vertical ? along : offset;
      path += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    out.push(path);
  }
  return out;
}

function hypotrochoid(
  bigR: number,
  r: number,
  d: number,
  revolutions: number,
  steps: number,
): string {
  const points: Array<[number, number]> = [];
  let max = 1;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * revolutions;
    const x = (bigR - r) * Math.cos(t) + d * Math.cos(((bigR - r) / r) * t);
    const y = (bigR - r) * Math.sin(t) - d * Math.sin(((bigR - r) / r) * t);
    points.push([x, y]);
    max = Math.max(max, Math.abs(x), Math.abs(y));
  }
  const scale = 46 / max;
  let path = '';
  points.forEach(([x, y], i) => {
    const sx = (50 + x * scale).toFixed(2);
    const sy = (50 + y * scale).toFixed(2);
    path += i === 0 ? `M ${sx} ${sy}` : ` L ${sx} ${sy}`;
  });
  return `${path} Z`;
}

function ringPaths(): string[] {
  return [
    hypotrochoid(11, 4, 5, 4, 720),
    hypotrochoid(13, 5, 6, 5, 720),
    hypotrochoid(9, 3, 5, 3, 600),
  ];
}

export function Guilloche({ variant = 'band', className }: GuillocheProps) {
  const classes = ['guilloche', `guilloche--${variant}`];
  if (className) classes.push(className);
  const cls = classes.join(' ');

  if (variant === 'ring') {
    return (
      <svg className={cls} viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
        {ringPaths().map((path, i) => (
          <path key={i} d={path} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    );
  }

  const vertical = variant === 'band-v';
  const viewBox = vertical ? '0 0 40 600' : '0 0 600 40';

  return (
    <svg
      className={cls}
      viewBox={viewBox}
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {waveLines(vertical, 9).map((path, i) => (
        <path key={i} d={path} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
