import { useState } from 'react';
import { createMnemonic } from '../../lib/wallet/account';

type Step = 'welcome' | 'reveal' | 'confirm' | 'done';

function App() {
  const [step, setStep] = useState<Step>('welcome');
  const [words, setWords] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);

  function startCreate() {
    setWords(createMnemonic().split(' '));
    setRevealed(false);
    setStep('reveal');
  }

  return (
    <main>
      <h1>Nerafi Wallet</h1>
      <p>Testnet only. Not for real funds.</p>

      {step === 'welcome' && (
        <button onClick={startCreate}>Create new wallet</button>
      )}

      {step === 'reveal' && (
        <section>
          <h2>Your recovery phrase</h2>
          <p>
            Write these 12 words on paper, in order. Anyone who sees them
            controls this wallet. Never share them, and never store them on
            this computer.
          </p>

          {revealed ? (
            <ol>
              {words.map((word, i) => (
                <li key={i}>{word}</li>
              ))}
            </ol>
          ) : (
            <button onClick={() => setRevealed(true)}>Reveal phrase</button>
          )}

          <button disabled={!revealed} onClick={() => setStep('confirm')}>
            I've written it down
          </button>
        </section>
      )}

      {step === 'confirm' && <p>Confirmation step comes next.</p>}
    </main>
  );
}

export default App;