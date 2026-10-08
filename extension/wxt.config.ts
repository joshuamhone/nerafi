import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Nerafi',
    description: 'Testnet-only wallet that explains transactions before you sign.',
    permissions: [],
  },
});