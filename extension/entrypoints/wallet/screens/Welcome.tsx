import { Button } from '../../../components/Button';
import { StepIndicator } from '../../../components/StepIndicator';
import { CREATE_STEPS } from './steps';

type WelcomeProps = {
  onCreate: () => void;
  onRestore: () => void;
};

export function Welcome({ onCreate, onRestore }: WelcomeProps) {
  return (
    <section className="screen">
      <StepIndicator steps={CREATE_STEPS} current={0} />

      <header className="screen-header">
        <h1 className="screen-title">Create a wallet</h1>
        <p className="screen-lead">
          Nerafi makes a new wallet on this computer and shows you a recovery phrase to write down.
          It holds Sepolia test ETH only.
        </p>
      </header>

      <div className="actions">
        <Button variant="primary" onClick={onCreate}>
          Create new wallet
        </Button>
        <Button variant="quiet" onClick={onRestore}>
          Restore from recovery phrase
        </Button>
      </div>
    </section>
  );
}
