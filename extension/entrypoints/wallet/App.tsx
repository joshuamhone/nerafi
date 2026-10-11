import { useState } from 'react';
import { createMnemonic, deriveAddress } from '../../lib/wallet/account';
import { checkConfirmation, pickConfirmationIndices } from '../../lib/wallet/confirm';

type Step = 'welcome' | 'reveal' | 'confirm' | 'done';

const CONFIRM_COUNT = 3;

function App() {
  const [step, setStep] = useState<Step>('welcome');
  const [words, setWords] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [indices, setIndices] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');

  function startCreate() {
    setWords(createMnemonic().split(' '));
    setRevealed(false);
    setStep('reveal');
  }

  function startConfirm() {
    setIndices(pickConfirmationIndices(words.length, CONFIRM_COUNT));
    setAnswers(Array.from({ length: CONFIRM_COUNT }, () => ''));
    setError('');
    setStep('confirm');
  }

  function backToPhrase() {
    setRevealed(false);
    setStep('reveal');
  }

  function updateAnswer(n: number, value: string) {
    setAnswers((prev) => prev.map((a, k) => (k === n ? value : a)));
  }

  function submitConfirmation() {
    if (!checkConfirmation(words, indices, answers)) {
      setError("Those words don't match. Check your written copy and try again.");
      return;
    }
    setAddress(deriveAddress(words.join(' ')));
    // The phrase is no longer needed on this page, so drop it.
    setWords([]);
    setAnswers([]);
    setIndices([]);
    setStep('done');
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

          <button disabled={!revealed} onClick={startConfirm}>
            I've written it down
          </button>
        </section>
      )}

      {step === 'confirm' && (
        <section>
          <h2>Confirm your backup</h2>
          <p>Enter these words from your written copy.</p>

          {indices.map((index, n) => (
            <p key={index}>
              <label>
                Word #{index + 1}{' '}
                <input
                  type="text"
                  value={answers[n] ?? ''}
                  onChange={(e) => updateAnswer(n, e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
            </p>
          ))}

          {error && <p role="alert">{error}</p>}

          <button onClick={submitConfirmation}>Confirm</button>{' '}
          <button onClick={backToPhrase}>Back to phrase</button>
        </section>
      )}

      {step === 'done' && (
        <section>
          <h2>Wallet created</h2>
          <p>Your address:</p>
          <code>{address}</code>
          <p>
            This wallet is not saved yet. Closing or reloading this tab erases
            it. Saving comes in the next milestone.
          </p>
        </section>
      )}
    </main>
  );
}

export default App;