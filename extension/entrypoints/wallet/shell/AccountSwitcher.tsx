import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AddressText } from '../../../components/AddressText';
import { ChevronIcon } from '../../../components/icons';
import { useWallet } from '../context';
import './AccountSwitcher.css';

export function AccountSwitcher() {
  const { accounts, activeIndex, switchAccount, addAccount, manageAccounts } = useWallet();
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const active = accounts.find((account) => account.index === activeIndex) ?? accounts[0];
  const itemCount = accounts.length + 2;

  useEffect(() => {
    if (!open) return undefined;
    const onDocumentDown = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentDown);
    return () => document.removeEventListener('mousedown', onDocumentDown);
  }, [open]);

  useEffect(() => {
    if (open && focusIndex >= 0) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  function openMenu() {
    setOpen(true);
    setFocusIndex(0);
  }

  function closeMenu() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveFocus(delta: number) {
    setFocusIndex((prev) => (prev + delta + itemCount) % itemCount);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
      setFocusIndex(itemCount - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  return (
    <div className="account-switcher" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="account-switcher-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span className="account-switcher-label">Account</span>
        <span className="account-switcher-name">
          <span className="account-switcher-name-text">{active?.name ?? 'Account'}</span>
          <ChevronIcon size={14} />
        </span>
      </button>

      {open && (
        <div className="account-menu" role="menu" onKeyDown={onMenuKeyDown}>
          {accounts.map((account, i) => {
            const isActive = account.index === activeIndex;
            return (
              <button
                key={account.index}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                ref={(node) => {
                  itemRefs.current[i] = node;
                }}
                className={isActive ? 'account-menu-item account-menu-item--active' : 'account-menu-item'}
                onClick={() => {
                  switchAccount(account.index);
                  closeMenu();
                }}
              >
                <span className="account-menu-name">{account.name}</span>
                <span className="account-menu-address">
                  <AddressText value={account.address} />
                </span>
              </button>
            );
          })}

          <div className="account-menu-separator" role="separator" />

          <button
            type="button"
            role="menuitem"
            ref={(node) => {
              itemRefs.current[accounts.length] = node;
            }}
            className="account-menu-item account-menu-item--action"
            onClick={() => {
              addAccount();
              closeMenu();
            }}
          >
            Add account
          </button>
          <button
            type="button"
            role="menuitem"
            ref={(node) => {
              itemRefs.current[accounts.length + 1] = node;
            }}
            className="account-menu-item account-menu-item--action"
            onClick={() => {
              manageAccounts();
              closeMenu();
            }}
          >
            Manage accounts
          </button>
        </div>
      )}
    </div>
  );
}
