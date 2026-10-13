import { useState } from 'react';
import type { FormEvent } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import { RecipientNotice } from '../../../components/RecipientNotice';
import { normalizeAccountName } from '../../../lib/wallet/accounts';
import { MAX_CONTACTS } from '../../../lib/wallet/contacts';
import type { Contact, NewContactResult } from '../../../lib/wallet/contacts';
import { formatDay } from './activityUtils';
import './AddressBookPage.css';

type AddressBookPageProps = {
  contacts: Contact[];
  validateAddress: (address: string) => NewContactResult;
  onAdd: (address: string, name: string) => Promise<string | null>;
  onRename: (address: string, name: string) => Promise<string | null>;
  onRemove: (address: string) => Promise<void>;
};

type LookalikeResult = Extract<NewContactResult, { status: 'lookalike' }>;

export function AddressBookPage({
  contacts,
  validateAddress,
  onAdd,
  onRename,
  onRemove,
}: AddressBookPageProps) {
  const [addAddress, setAddAddress] = useState('');
  const [addName, setAddName] = useState('');
  const [addError, setAddError] = useState('');
  const [pending, setPending] = useState<LookalikeResult | null>(null);
  const [pendingConfirmed, setPendingConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');

  const [removingAddress, setRemovingAddress] = useState<string | null>(null);

  const full = contacts.length >= MAX_CONTACTS;
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));

  function resetAddForm() {
    setAddAddress('');
    setAddName('');
    setAddError('');
    setPending(null);
    setPendingConfirmed(false);
  }

  async function submitAdd(event: FormEvent) {
    event.preventDefault();
    setAddError('');
    const nameResult = normalizeAccountName(addName);
    if (!nameResult.ok) {
      setAddError(nameResult.error);
      return;
    }
    const result = validateAddress(addAddress);
    if (result.status === 'error') {
      setAddError(result.error);
      return;
    }
    if (result.status === 'lookalike') {
      setPending(result);
      setPendingConfirmed(false);
      return;
    }
    setBusy(true);
    const error = await onAdd(result.address, nameResult.name);
    setBusy(false);
    if (error !== null) {
      setAddError(error);
      return;
    }
    resetAddForm();
  }

  async function confirmPending() {
    if (pending === null) return;
    setAddError('');
    const nameResult = normalizeAccountName(addName);
    if (!nameResult.ok) {
      setAddError(nameResult.error);
      setPending(null);
      return;
    }
    setBusy(true);
    const error = await onAdd(pending.address, nameResult.name);
    setBusy(false);
    if (error !== null) {
      setAddError(error);
      setPending(null);
      return;
    }
    resetAddForm();
  }

  async function submitRename(event: FormEvent, address: string) {
    event.preventDefault();
    setEditError('');
    setBusy(true);
    const error = await onRename(address, editName);
    setBusy(false);
    if (error !== null) {
      setEditError(error);
      return;
    }
    setEditingAddress(null);
    setEditName('');
  }

  async function confirmRemove(address: string) {
    setBusy(true);
    await onRemove(address);
    setBusy(false);
    setRemovingAddress(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Address book</h1>
      </header>

      <p className="contacts-lead">
        Saved contacts are a local convenience only. The name is never proof of anything — always
        check the full address before sending.
      </p>

      <section className="panel contacts-add">
        <h2 className="panel-title">Add a contact</h2>

        {full ? (
          <Notice variant="info">
            Your address book is full ({MAX_CONTACTS} contacts). Delete one to add another.
          </Notice>
        ) : (
          <form className="stack-form" onSubmit={submitAdd}>
            <Field
              id="contact-address"
              label="Address"
              mono
              value={addAddress}
              onChange={(e) => setAddAddress(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <Field
              id="contact-name"
              label="Name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />

            {addError !== '' && <Notice variant="alert">{addError}</Notice>}

            {pending !== null && (
              <div className="contacts-confirm">
                <RecipientNotice
                  info={{ kind: 'lookalike', match: pending.match }}
                  address={pending.address}
                />
                <label className="contacts-ack">
                  <input
                    type="checkbox"
                    checked={pendingConfirmed}
                    onChange={(e) => setPendingConfirmed(e.target.checked)}
                  />
                  <span>
                    I have checked every character. This is not {pending.match.known.label}.
                  </span>
                </label>
                <div className="actions">
                  <Button
                    variant="primary"
                    onClick={() => void confirmPending()}
                    disabled={!pendingConfirmed || busy}
                  >
                    Add contact
                  </Button>
                  <Button variant="quiet" onClick={() => setPending(null)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {pending === null && (
              <div className="actions">
                <Button variant="primary" type="submit" disabled={busy}>
                  Add contact
                </Button>
              </div>
            )}
          </form>
        )}
      </section>

      {sorted.length === 0 ? (
        <p className="contacts-empty">No saved contacts yet.</p>
      ) : (
        <ul className="contacts-list">
          {sorted.map((contact) => (
            <li key={contact.address} className="contacts-item">
              <div className="contacts-item-main">
                <span className="contacts-name">{contact.name}</span>
                <AddressText value={contact.address} className="contacts-address" />
                <span className="contacts-saved">Saved {formatDay(contact.addedAt)}</span>
              </div>

              {removingAddress === contact.address ? (
                <div className="contacts-item-actions">
                  <span className="contacts-remove-question">
                    Remove {contact.name} from your address book?
                  </span>
                  <Button
                    variant="primary"
                    onClick={() => void confirmRemove(contact.address)}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => setRemovingAddress(null)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </div>
              ) : editingAddress === contact.address ? (
                <form
                  className="contacts-rename"
                  onSubmit={(event) => void submitRename(event, contact.address)}
                >
                  <Field
                    id={`rename-${contact.address}`}
                    label="Name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    error={editError !== '' ? editError : undefined}
                  />
                  <div className="actions">
                    <Button variant="primary" type="submit" disabled={busy}>
                      Save
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setEditingAddress(null);
                        setEditError('');
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="contacts-item-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingAddress(contact.address);
                      setEditName(contact.name);
                      setEditError('');
                      setRemovingAddress(null);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setRemovingAddress(contact.address);
                      setEditingAddress(null);
                    }}
                  >
                    Delete
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
