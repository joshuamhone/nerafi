import { useState } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { formatTokenBalance, formatTokenExact } from '../../../lib/wallet/format';
import { MSG_SAME_SYMBOL, sameSymbolAddresses } from '../../../lib/wallet/tokens';
import type { Token } from '../../../lib/wallet/tokens';
import { useWallet } from '../context';
import './TokensSection.css';

export const TOKENS_EMPTY_TEXT = 'No tokens added. Add a token by its contract address.';
export const TOKEN_BALANCE_FAILED = "Couldn't load";

type TokensSectionProps = {
  onAdd: () => void;
  onRemove: (address: string) => Promise<void>;
};

function BalanceText({ token }: { token: Token }) {
  const { tokenBalances, tokenBalancesLoading } = useWallet();
  const key = token.address.toLowerCase();
  const balance = tokenBalances[key];

  if (balance === undefined) {
    return tokenBalancesLoading ? (
      <span className="skeleton skeleton--token" aria-label="Loading balance" />
    ) : (
      <span className="token-balance token-balance--failed">{TOKEN_BALANCE_FAILED}</span>
    );
  }
  if (balance === null) {
    return <span className="token-balance token-balance--failed">{TOKEN_BALANCE_FAILED}</span>;
  }
  return (
    <span className="token-balance tabular" title={formatTokenExact(balance, token.decimals)}>
      {formatTokenBalance(balance, token.decimals)}
      <span className="token-unit"> {token.symbol}</span>
    </span>
  );
}

export function TokensSection({ onAdd, onRemove }: TokensSectionProps) {
  const { tokens } = useWallet();
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clashing = sameSymbolAddresses(tokens);

  async function confirmRemove(address: string) {
    setBusy(true);
    try {
      await onRemove(address);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  return (
    <section className="panel tokens-panel" aria-labelledby="tokens-title">
      <div className="tokens-header">
        <h2 className="panel-title" id="tokens-title">
          Tokens
        </h2>
        <Button variant="secondary" onClick={onAdd}>
          Add token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <p className="tokens-empty">{TOKENS_EMPTY_TEXT}</p>
      ) : (
        <ul className="tokens-list">
          {tokens.map((token) => (
            <li key={token.address} className="tokens-item">
              <div className="tokens-item-top">
                <span className="tokens-item-id">
                  <span className="token-symbol">{token.symbol}</span>
                  <span className="token-name">{token.name}</span>
                </span>
                <BalanceText token={token} />
              </div>

              <AddressText value={token.address} className="tokens-address" />

              {clashing.has(token.address.toLowerCase()) && (
                <p className="tokens-warning" role="note">
                  {MSG_SAME_SYMBOL}
                </p>
              )}

              {removing === token.address ? (
                <div className="tokens-remove">
                  <span className="tokens-remove-question">
                    Remove {token.symbol} from your list? Your balance is not affected.
                  </span>
                  <Button
                    variant="primary"
                    onClick={() => void confirmRemove(token.address)}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                  <Button variant="quiet" onClick={() => setRemoving(null)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="tokens-remove">
                  <Button variant="quiet" onClick={() => setRemoving(token.address)}>
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
