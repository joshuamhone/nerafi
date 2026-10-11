import './StepIndicator.css';

type StepIndicatorProps = {
  steps: string[];
  /** Zero-based index of the current step. */
  current: number;
};

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <ol className="steps" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
        return (
          <li
            key={label}
            className={`step step--${state}`}
            aria-current={i === current ? 'step' : undefined}
          >
            <span className="step-index" aria-hidden="true">
              {i + 1}
            </span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
