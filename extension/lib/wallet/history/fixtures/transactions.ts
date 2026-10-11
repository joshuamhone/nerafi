export const OWN_ADDRESS = '0xAA34d47F8dC1F8F4ABF45e30d0eB7428534E925e';
export const OTHER_ADDRESS = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
export const CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';
export const REAL_HASH = '0x91e413c399e51abffde70eb158cc2ba7581d01b480aa512fd981ee6efdb44779';
export const TX_HASH = '0x' + 'ab'.repeat(32);
export const FAUCET_ADDRESS = '0x6EFB29CEe3b414272EB7A8F3Ebabf873D36bC033';

export type FixtureItem = Record<string, unknown>;

export const realItem: FixtureItem = {
  priority_fee: '12000048000',
  raw_input: '0x',
  is_pending_update: false,
  result: 'success',
  hash: REAL_HASH,
  max_fee_per_gas: '1000020',
  revert_reason: null,
  confirmation_duration: [0, 1.2e4],
  transaction_burnt_fee: '168000',
  type: 2,
  token_transfers_overflow: null,
  confirmations: 42,
  position: 102,
  max_priority_fee_per_gas: '1000004',
  transaction_tag: null,
  created_contract: null,
  value: '100000000000',
  from: {
    ens_domain_name: null,
    hash: OWN_ADDRESS,
    implementations: [],
    is_contract: false,
    is_scam: false,
    is_verified: false,
    metadata: null,
    name: null,
    private_tags: [],
    proxy_type: null,
    public_tags: [],
    reputation: 'ok',
    watchlist_names: [],
  },
  gas_used: '12000',
  status: 'ok',
  to: {
    ens_domain_name: null,
    hash: OWN_ADDRESS,
    implementations: [],
    is_contract: false,
    is_scam: false,
    is_verified: false,
    metadata: null,
    name: null,
    private_tags: [],
    proxy_type: null,
    public_tags: [],
    reputation: 'ok',
    watchlist_names: [],
  },
  authorization_list: [],
  method: null,
  fee: { type: 'actual', value: '12000216000' },
  gas_limit: '12000',
  gas_price: '1000018',
  decoded_input: null,
  fhe_operations_count: 0,
  token_transfers: null,
  base_fee_per_gas: '14',
  timestamp: '2026-10-11T20:06:00.000000Z',
  nonce: 3,
  historic_exchange_rate: null,
  transaction_types: ['coin_transfer'],
  exchange_rate: null,
  block_number: 11894000,
  has_error_in_internal_transactions: false,
};

const base = (): FixtureItem => ({ ...realItem });

export function makeItem(overrides: Record<string, unknown>): FixtureItem {
  return { ...base(), ...overrides };
}

export const incomingItem = makeItem({
  from: { hash: OTHER_ADDRESS, is_contract: false, is_scam: false, reputation: 'ok' },
  to: { hash: OWN_ADDRESS, is_contract: false, is_scam: false, reputation: 'ok' },
});

export const outgoingItem = makeItem({
  from: { hash: OWN_ADDRESS, is_contract: false, is_scam: false, reputation: 'ok' },
  to: { hash: OTHER_ADDRESS, is_contract: false, is_scam: true, reputation: 'low_risk' },
});

export const failedItem = makeItem({
  result: 'error',
  status: 'error',
  confirmations: 343,
});

export const pendingItem = makeItem({
  result: 'pending',
  status: null,
  block_number: null,
  confirmations: 0,
});

export const contractCreationItem = makeItem({
  from: { hash: OWN_ADDRESS, is_contract: false, is_scam: false, reputation: 'ok' },
  to: null,
  transaction_types: ['contract_creation'],
  created_contract: { hash: CONTRACT_ADDRESS, is_contract: true, is_scam: false, reputation: null },
});

export const bareContractCreationItem = makeItem({
  from: { hash: OWN_ADDRESS, is_contract: false, is_scam: false, reputation: 'ok' },
  to: null,
  transaction_types: ['contract_creation'],
});

export const okWithOddResultItem = makeItem({
  result: 'Error: (Awaiting internal transactions for reason)',
  status: 'ok',
});

export const nullStatusWithBlockItem = makeItem({
  result: 'success',
  status: null,
});

export const errorRevertedItem = makeItem({
  result: 'Reverted',
  status: 'error',
});

export const weirdStatusItem = makeItem({
  result: 'success',
  status: 'weird',
});

export const longReasonItem = makeItem({
  result: 'x'.repeat(250),
  status: 'error',
});

export const unrelatedItem = makeItem({
  hash: '0x' + 'cd'.repeat(32),
  from: { hash: OTHER_ADDRESS, is_contract: false, is_scam: false, reputation: 'ok' },
  to: { hash: OTHER_ADDRESS, is_contract: false, is_scam: false, reputation: 'ok' },
});

export const malformedItems: FixtureItem[] = [
  makeItem({ hash: '0x1234' }),
  makeItem({ from: { hash: '0xnotanaddress', is_contract: false, is_scam: false, reputation: 'ok' } }),
  makeItem({ value: '1e18' }),
  makeItem({ value: '-5' }),
  makeItem({ from: undefined }),
];