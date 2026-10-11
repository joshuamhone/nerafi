import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import { StepIndicator } from '../../../components/StepIndicator';
import { CREATE_STEPS } from './steps';

type ConfirmProps = {
  indices: number[];
  answers: string[];
  error: string;
  onAnswer: (n: number, value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
};

export function Confirm({ indices, answers, error, onAnswer, onSubmit, onBack }: ConfirmProps) {
  return (
    <section className="screen">
      <StepIndicator steps={CREATE_STEPS} current={2} />

      <header className="screen-header">
        <h1 className="screen-title">Confirm your backup</h1>
        <p className="screen-lead">Enter these words from your written copy.</p>
      </header>

      <div className="stack-form">
        {indices.map((index, n) => (
          <Field
            key={index}
            id={`confirm-word-${index}`}
            label={`Word ${index + 1}`}
            value={answers[n] ?? ''}
            onChange={(e) => onAnswer(n, e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        ))}
      </div>

      {error && <Notice variant="alert">{error}</Notice>}

      <div className="actions">
        <Button variant="primary" onClick={onSubmit}>
          Confirm
        </Button>
        <Button variant="quiet" onClick={onBack}>
          Back to phrase
        </Button>
      </div>
    </section>
  );
}
