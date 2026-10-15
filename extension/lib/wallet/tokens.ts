import { browser } from 'wxt/browser';
import { erc20Abi, getAddress, isAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { assertSepolia, createSepoliaClient } from './network';
import { isNativeEthLogAddress } from './nativeEthLog';
import { sanitizeTokenName, sanitizeTokenSymbol } from './tokenText';

export const TOKENS_KEY = 'nerafi.tokens';
export const MAX_TOKENS = 50;
export const MAX_TOKEN_DECIMALS = 36;

export const MSG_NO_CONTRACT = 'No contract at this address on Sepolia.';
export const MSG_NOT_ERC20 = 'This does not look like a standard ERC-20 token.';
export const MSG_SAME_SYMBOL =
  'Another token in your list uses the same symbol. Check the contract address.';
export const MSG_TOKEN_IDENTITY =
  'Anyone can create a token with any name. The contract address is its identity.';

export type Token = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  addedAt: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function isValidDecimals(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_TOKEN_DECIMALS
  );
}

// Strict entry parsing. Stored text must already be in its sanitised form: an
// entry whose symbol or name would change when sanitised is treated as altered
// and dropped.
export function parseToken(value: unknown): Token | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ['address', 'symbol', 'name', 'decimals', 'addedAt'])) return null;
  if (typeof value.address !== 'string' || !isAddress(value.address)) return null;
  if (typeof value.symbol !== 'string' || sanitizeTokenSymbol(value.symbol) !== value.symbol) {
    return null;
  }
  if (typeof value.name !== 'string' || sanitizeTokenName(value.name) !== value.name) return null;
  if (!isValidDecimals(value.decimals)) return null;
  if (typeof value.addedAt !== 'number' || !Number.isFinite(value.addedAt)) return null;
  return {
    address: getAddress(value.address),
    symbol: value.symbol,
    name: value.name,
    decimals: value.decimals,
    addedAt: value.addedAt,
  };
}

// Malformed entries and duplicates (case-insensitive) are dropped one by one;
// anything beyond the limit is dropped. Never throws on bad storage.
export function parseTokens(value: unknown): Token[] {
  if (!Array.isArray(value)) return [];
  const tokens: Token[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const token = parseToken(item);
    if (token === null) continue;
    const key = token.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
    if (tokens.length >= MAX_TOKENS) break;
  }
  return tokens;
}

export async function loadTokens(): Promise<Token[]> {
  const stored = await browser.storage.local.get(TOKENS_KEY);
  return parseTokens(stored[TOKENS_KEY]);
}

async function saveTokens(tokens: Token[]): Promise<void> {
  await browser.storage.local.set({ [TOKENS_KEY]: tokens });
}

export type VerifiedToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
};

export type AddTokenResult =
  | { ok: true; token: Token; tokens: Token[] }
  | { ok: false; error: string };

export async function addToken(
  verified: VerifiedToken,
  now: number = Date.now(),
): Promise<AddTokenResult> {
  if (!isAddress(verified.address) || !isValidDecimals(verified.decimals)) {
    return { ok: false, error: MSG_NOT_ERC20 };
  }
  const current = await loadTokens();
  const lower = verified.address.toLowerCase();
  if (current.some((item) => item.address.toLowerCase() === lower)) {
    return { ok: false, error: 'This token is already in your list.' };
  }
  if (current.length >= MAX_TOKENS) {
    return { ok: false, error: `Your token list is full (${MAX_TOKENS} tokens).` };
  }
  const token: Token = {
    address: getAddress(verified.address),
    symbol: sanitizeTokenSymbol(verified.symbol),
    name: sanitizeTokenName(verified.name),
    decimals: verified.decimals,
    addedAt: now,
  };
  const tokens = [...current, token];
  await saveTokens(tokens);
  return { ok: true, token, tokens };
}

export async function removeToken(address: string): Promise<Token[]> {
  const current = await loadTokens();
  const lower = address.trim().toLowerCase();
  const tokens = current.filter((item) => item.address.toLowerCase() !== lower);
  await saveTokens(tokens);
  return tokens;
}

// Addresses (lower-case) of listed tokens whose sanitised symbol is shared with
// another listed token. Case-insensitive, so "usdc" and "USDC" clash.
export function sameSymbolAddresses(tokens: Token[]): Set<string> {
  const bySymbol = new Map<string, string[]>();
  for (const token of tokens) {
    // The native-ETH log address is not a token and takes no part in symbol clashes.
    if (isNativeEthLogAddress(token.address)) continue;
    const key = token.symbol.toLowerCase();
    const list = bySymbol.get(key);
    if (list === undefined) bySymbol.set(key, [token.address.toLowerCase()]);
    else list.push(token.address.toLowerCase());
  }
  const clashing = new Set<string>();
  for (const list of bySymbol.values()) {
    if (list.length > 1) for (const address of list) clashing.add(address);
  }
  return clashing;
}

// True when a symbol that is about to be added is already used by a listed token.
export function symbolIsListed(tokens: Token[], rawSymbol: string): boolean {
  const key = sanitizeTokenSymbol(rawSymbol).toLowerCase();
  return tokens.some((token) => token.symbol.toLowerCase() === key);
}

// The small surface of the RPC the token code needs. Every read returns
// `unknown`, so a mock (or a hostile contract) can hand back anything and the
// callers still have to check it.
export type TokenClient = {
  getChainId(): Promise<number>;
  getCode(address: Address): Promise<Hex | undefined>;
  readDecimals(address: Address): Promise<unknown>;
  readSymbol(address: Address): Promise<unknown>;
  readName(address: Address): Promise<unknown>;
  readBalance(token: Address, owner: Address): Promise<unknown>;
};

export function createTokenClient(): TokenClient {
  const client = createSepoliaClient();
  return {
    getChainId: () => client.getChainId(),
    getCode: (address) => client.getCode({ address }),
    readDecimals: (address) =>
      client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    readSymbol: (address) =>
      client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    readName: (address) => client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
    readBalance: (token, owner) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      }),
  };
}

export type VerifyTokenResult =
  | { ok: true; token: VerifiedToken }
  | { ok: false; error: string };

export async function verifyToken(
  client: TokenClient,
  input: string,
): Promise<VerifyTokenResult> {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, error: 'Enter a token contract address.' };
  if (!isAddress(trimmed, { strict: false })) {
    return { ok: false, error: 'That is not a valid Ethereum address.' };
  }
  if (!isAddress(trimmed)) {
    return { ok: false, error: 'This address has a checksum error — check it for typos.' };
  }
  const address = getAddress(trimmed);

  try {
    await assertSepolia(client);
  } catch {
    return { ok: false, error: 'Could not confirm the Sepolia network.' };
  }

  let code: Hex | undefined;
  try {
    code = await client.getCode(address);
  } catch {
    return { ok: false, error: 'Could not reach the Sepolia network.' };
  }
  if (code === undefined || code === '0x') return { ok: false, error: MSG_NO_CONTRACT };

  let decimals: unknown;
  let symbol: unknown;
  let name: unknown;
  try {
    [decimals, symbol, name] = await Promise.all([
      client.readDecimals(address),
      client.readSymbol(address),
      client.readName(address),
    ]);
  } catch {
    return { ok: false, error: MSG_NOT_ERC20 };
  }
  if (!isValidDecimals(decimals)) return { ok: false, error: MSG_NOT_ERC20 };
  if (typeof symbol !== 'string' || typeof name !== 'string') {
    return { ok: false, error: MSG_NOT_ERC20 };
  }

  return {
    ok: true,
    token: {
      address,
      symbol: sanitizeTokenSymbol(symbol),
      name: sanitizeTokenName(name),
      decimals,
    },
  };
}

export type TokenBalance = { address: string; balance: bigint | null };

export const BALANCE_CONCURRENCY = 4;

// Run `task` over every item with at most `limit` in flight, keeping result
// order. A rejection is recorded for that item only; the others carry on.
async function settleWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) continue;
      try {
        results[index] = { status: 'fulfilled', value: await task(item) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// One balanceOf per listed token, at most BALANCE_CONCURRENCY at a time so a
// full list of 50 does not fire 50 requests at the public RPC at once. Each
// token fails on its own: a read that fails, or returns anything other than a
// non-negative bigint, is null ("Couldn't load") — never 0.
export async function readTokenBalances(
  client: TokenClient,
  owner: string,
  tokens: Token[],
): Promise<TokenBalance[]> {
  if (!isAddress(owner)) return tokens.map((token) => ({ address: token.address, balance: null }));
  const ownerAddress = getAddress(owner);
  const results = await settleWithLimit(tokens, BALANCE_CONCURRENCY, (token) =>
    client.readBalance(getAddress(token.address), ownerAddress),
  );
  return tokens.map((token, index) => {
    const result = results[index];
    if (result === undefined || result.status !== 'fulfilled') {
      return { address: token.address, balance: null };
    }
    const value = result.value;
    return {
      address: token.address,
      balance: typeof value === 'bigint' && value >= 0n ? value : null,
    };
  });
}
