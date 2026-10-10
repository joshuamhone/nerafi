import { browser } from 'wxt/browser';

function openWallet() {
  browser.tabs.create({ url: browser.runtime.getURL('/wallet.html') });
}

function App() {
  return (
    <main>
      <h1>Nerafi</h1>
      <p>Testnet only. Not for real funds.</p>
      <button onClick={openWallet}>Open wallet</button>
    </main>
  );
}

export default App;