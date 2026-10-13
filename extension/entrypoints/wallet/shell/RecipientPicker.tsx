import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import './RecipientPicker.css';

export type RecipientOption = {
  name: string;
  address: string;
  kind: 'account' | 'contact';
};

type RecipientPickerProps = {
  options: RecipientOption[];
  onChoose: (address: string) => void;
  onClose: () => void;
};

export function RecipientPicker({ options, onChoose, onClose }: RecipientPickerProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(0);

  // Focus the first saved recipient on open and return focus to the control
  // that opened the dialog when it closes.
  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      openerRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (options.length > 0) itemRefs.current[focusIndex]?.focus();
  }, [focusIndex, options.length]);

  function moveFocus(delta: number) {
    if (options.length === 0) return;
    setFocusIndex((prev) => (prev + delta + options.length) % options.length);
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFocusIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setFocusIndex(options.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipient-picker-title"
      >
        <h2 className="picker-title" id="recipient-picker-title">
          Choose recipient
        </h2>
        <p className="picker-lead">Pick one of your accounts or a saved contact.</p>

        {options.length === 0 ? (
          <p className="picker-empty">
            You have no other accounts and no saved contacts yet.
          </p>
        ) : (
          <ul
            className="picker-list"
            aria-label="Saved recipients"
            onKeyDown={onListKeyDown}
          >
            {options.map((option, i) => (
              <li key={option.address}>
                <button
                  type="button"
                  ref={(node) => {
                    itemRefs.current[i] = node;
                  }}
                  className="picker-item"
                  onClick={() => onChoose(option.address)}
                >
                  <span className="picker-item-head">
                    <span className="picker-name">{option.name}</span>
                    <span className="picker-kind">
                      {option.kind === 'account' ? 'Your account' : 'Contact'}
                    </span>
                  </span>
                  <span className="picker-address">
                    <AddressText value={option.address} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="actions">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
