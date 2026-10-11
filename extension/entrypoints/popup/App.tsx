import { browser } from 'wxt/browser';
import { Button } from '../../components/Button';
import { Seal } from '../../components/Seal';
import './style.css';

function openWallet() {
  browser.tabs.create({ url: browser.runtime.getURL('/wallet.html') });
}

function App() {
  return (
    <main className="popup">
      <div className="popup-brand">
        <Seal size={24} />
        <span className="popup-wordmark">Nerafi</span>
      </div>

      <span className="popup-pill">Testnet only</span>

      <p className="popup-lead">
        A testnet wallet that explains each transaction before you sign.
      </p>

      <Button variant="primary" onClick={openWallet} className="popup-open">
        Open wallet
      </Button>
    </main>
  );
}

export default App;
