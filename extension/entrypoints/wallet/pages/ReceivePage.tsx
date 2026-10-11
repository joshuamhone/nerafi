import { useMemo, useState } from 'react';
import encodeQR from 'qr';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Notice } from '../../../components/Notice';
import { buildReceiveUri } from '../../../lib/wallet/receive';
import { useWallet } from '../context';
import './ReceivePage.css';

export function Receive() {
  const { address } = useWallet();
  const uri = useMemo(() => buildReceiveUri(address), [address]);
  const svg = useMemo(() => encodeQR(uri, 'svg', { border: 4 }), [uri]);

  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Receive</h1>
      </header>

      <div className="receive-width">
        <Notice variant="info">
          Nerafi only shows Sepolia. Anything sent on another network will not appear here.
        </Notice>

        <div className="receive-card">
        <div
          className="receive-qr"
          role="img"
          aria-label={`QR code for ${address} on Sepolia testnet`}
        >
          <div className="receive-qr-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>

        <div className="receive-address">
          <span className="address-label">Your Sepolia address</span>
          <AddressText value={address} />
        </div>

        <div className="receive-actions">
          <Button variant="secondary" type="button" onClick={onCopy} disabled={copied}>
            {copied ? 'Copied' : 'Copy address'}
          </Button>
          <span className="receive-copy-state" role="status" aria-live="polite" aria-atomic="true">
            {copied ? 'Copied' : ''}
          </span>
        </div>

        {copyFailed && (
          <Notice variant="alert">Copy failed — select the address manually</Notice>
        )}
        </div>
      </div>
    </section>
  );
}