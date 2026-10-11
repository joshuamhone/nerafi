import { Button } from './Button';
import { LockIcon } from './icons';
import { Seal } from './Seal';
import './TopBar.css';

export type LockState = 'none' | 'locked' | 'unlocked';

type TopBarProps = {
  lockState: LockState;
  onLock: () => void;
  busy: boolean;
};

export function TopBar({ lockState, onLock, busy }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Seal size={22} />
        <span className="wordmark">Nerafi</span>
      </div>

      <div className="topbar-actions">
        <span className="testnet-pill">Testnet only</span>

        {lockState !== 'none' && (
          <span className="lock-state">
            <LockIcon size={14} />
            {lockState === 'unlocked' ? 'Unlocked' : 'Locked'}
          </span>
        )}

        {lockState === 'unlocked' && (
          <Button
            variant="secondary"
            onClick={onLock}
            disabled={busy}
            className="topbar-lock"
          >
            Lock
          </Button>
        )}
      </div>
    </header>
  );
}
