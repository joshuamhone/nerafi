import { Button } from '../../../components/Button';
import { StepIndicator } from '../../../components/StepIndicator';
import { CREATE_STEPS } from './steps';
import './Reveal.css';

type RevealProps = {
  words: string[];
  revealed: boolean;
  onReveal: () => void;
  onContinue: () => void;
};

export function Reveal({ words, revealed, onReveal, onContinue }: RevealProps) {
  return (
    <section className="screen">
      <StepIndicator steps={CREATE_STEPS} current={1} />

      <header className="screen-header">
        <h1 className="screen-title">Write down your recovery phrase</h1>
        <p className="screen-lead">
          Anyone who sees these 12 words controls this wallet. Write them on paper, in order, and
          never store them on this computer.
        </p>
      </header>

      <ol className="phrase-grid">
        {words.map((word, i) => (
          <li key={i} className="phrase-tile">
            <span className="phrase-index">{i + 1}</span>
            {revealed ? (
              <span className="phrase-word">{word}</span>
            ) : (
              <span className="phrase-blank" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>

      <div className="actions">
        {!revealed && (
          <Button variant="secondary" onClick={onReveal}>
            Reveal phrase
          </Button>
        )}
        <Button variant="primary" onClick={onContinue} disabled={!revealed}>
          I've written it down
        </Button>
      </div>
    </section>
  );
}
