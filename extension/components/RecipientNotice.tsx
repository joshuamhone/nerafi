import { AddressText } from './AddressText';
import { Notice } from './Notice';
import type { RecipientInfo } from '../lib/wallet/recipientSafety';
import './RecipientNotice.css';

function savedDate(addedAt: number): string {
  return new Date(addedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type RecipientNoticeProps = {
  info: RecipientInfo;
  address: string;
  onPaper?: boolean;
};

/**
 * The one classification shown next to a typed recipient. It is deliberately
 * exactly one of: our own account, a saved contact, an address we have sent to
 * before, a lookalike warning, or a first-time warning — never several.
 */
export function RecipientNotice({ info, address, onPaper = false }: RecipientNoticeProps) {
  if (info.kind === 'own') {
    return <p className="recipient-note">Your account: {info.name}</p>;
  }
  if (info.kind === 'contact') {
    return (
      <p className="recipient-note">
        Contact: {info.name} · saved {savedDate(info.addedAt)}
      </p>
    );
  }
  if (info.kind === 'sent') {
    return <p className="recipient-note">You have sent to this address before.</p>;
  }
  if (info.kind === 'unknown') {
    return (
      <p className="recipient-note recipient-note--warn">
        First time sending to this address. Check it against a source you trust, not your
        transaction history.
      </p>
    );
  }
  return (
    <Notice variant="alert" onPaper={onPaper}>
      <p className="recipient-alert-text">
        This address looks like {info.match.known.label} but is a different address.
      </p>
      <div className="recipient-compare">
        <span className="recipient-compare-label">This address</span>
        <AddressText value={address} compareTo={info.match.known.address} onPaper={onPaper} />
      </div>
      <div className="recipient-compare">
        <span className="recipient-compare-label">{info.match.known.label}</span>
        <AddressText
          value={info.match.known.address}
          compareTo={address}
          onPaper={onPaper}
        />
      </div>
    </Notice>
  );
}
