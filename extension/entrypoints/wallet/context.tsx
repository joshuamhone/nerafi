import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isAddress } from 'viem';
import type { StoredAccount } from '../../lib/wallet/accounts';
import type { KnownAddress } from '../../lib/wallet/lookalike';
import { createSepoliaClient, SEPOLIA_CHAIN_ID, SEPOLIA_RPC_URL } from '../../lib/wallet/network';
import { createTokenClient, readTokenBalances } from '../../lib/wallet/tokens';
import type { Token } from '../../lib/wallet/tokens';
import { clearLoadedHistory } from '../../lib/wallet/history/loaded';

export type NetworkStatus = 'checking' | 'reachable' | 'unreachable';

// Lower-case token address -> balance. null means the read failed (shown as
// "Couldn't load", never as 0); a missing key means not read yet.
export type TokenBalances = Record<string, bigint | null>;

type WalletContextValue = {
  address: string;
  balanceWei: bigint | null;
  balanceLoading: boolean;
  balanceError: string;
  lastUpdated: number | null;
  network: NetworkStatus;
  blockNumber: bigint | null;
  rpcHost: string;
  refresh: () => void;
  lock: () => void;
  accounts: StoredAccount[];
  activeIndex: number;
  switchAccount: (index: number) => void;
  manageAccounts: () => void;
  addAccount: () => void;
  known: KnownAddress[];
  tokens: Token[];
  tokenBalances: TokenBalances;
  tokenBalancesLoading: boolean;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function rpcHost(): string {
  try {
    return new URL(SEPOLIA_RPC_URL).host;
  } catch {
    return SEPOLIA_RPC_URL;
  }
}

type WalletProviderProps = {
  address: string;
  onLock: () => void;
  accounts: StoredAccount[];
  activeIndex: number;
  onSwitchAccount: (index: number) => void;
  onManageAccounts: () => void;
  onAddAccount: () => void;
  known: KnownAddress[];
  tokens: Token[];
  children: ReactNode;
};

export function WalletProvider({
  address,
  onLock,
  accounts,
  activeIndex,
  onSwitchAccount,
  onManageAccounts,
  onAddAccount,
  known,
  tokens,
  children,
}: WalletProviderProps) {
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [network, setNetwork] = useState<NetworkStatus>('checking');
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalances>({});
  const [tokenBalancesLoading, setTokenBalancesLoading] = useState(false);

  const refreshEth = useCallback(() => {
    if (!isAddress(address)) {
      setNetwork('unreachable');
      setBalanceError('Could not reach the Sepolia network.');
      return;
    }
    const walletAddress = address;
    setBalanceError('');
    setNetwork((prev) => (prev === 'reachable' ? prev : 'checking'));
    setBalanceLoading(true);
    let cancelled = false;
    void (async () => {
      const client = createSepoliaClient();
      try {
        const chainId = await client.getChainId();
        if (chainId !== SEPOLIA_CHAIN_ID) throw new Error('Wrong network.');
        const [block, balance] = await Promise.all([
          client.getBlockNumber(),
          client.getBalance({ address: walletAddress }),
        ]);
        if (cancelled) return;
        setBalanceWei(balance);
        setBlockNumber(block);
        setLastUpdated(Date.now());
        setNetwork('reachable');
      } catch {
        if (cancelled) return;
        setBalanceWei(null);
        setBlockNumber(null);
        setBalanceError('Could not reach the Sepolia network.');
        setNetwork('unreachable');
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const refreshTokens = useCallback(() => {
    if (tokens.length === 0) {
      setTokenBalances({});
      setTokenBalancesLoading(false);
      return undefined;
    }
    let cancelled = false;
    setTokenBalancesLoading(true);
    void (async () => {
      try {
        const results = await readTokenBalances(createTokenClient(), address, tokens);
        if (cancelled) return;
        const next: TokenBalances = {};
        for (const result of results) next[result.address.toLowerCase()] = result.balance;
        setTokenBalances(next);
      } catch {
        if (cancelled) return;
        const failed: TokenBalances = {};
        for (const token of tokens) failed[token.address.toLowerCase()] = null;
        setTokenBalances(failed);
      } finally {
        if (!cancelled) setTokenBalancesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, tokens]);

  // The one refresh the rest of the wallet calls: ETH balance and token
  // balances together, so tokens follow the same cadence as the ETH balance.
  // Held in a ref so `refresh` keeps one identity when the token list changes;
  // consumers (the history feed) re-run their own effects if it changes.
  const refreshTokensRef = useRef(refreshTokens);
  useEffect(() => {
    refreshTokensRef.current = refreshTokens;
  }, [refreshTokens]);

  const refresh = useCallback(() => {
    refreshEth();
    refreshTokensRef.current();
  }, [refreshEth]);

  useEffect(() => {
    return refreshEth();
  }, [refreshEth]);

  // Loaded history is kept in memory for the Security Center and must not
  // outlive the unlocked wallet: the provider goes away on lock.
  useEffect(() => {
    return () => clearLoadedHistory();
  }, []);

  useEffect(() => {
    return refreshTokens();
  }, [refreshTokens]);

  const lock = useCallback(() => onLock(), [onLock]);

  const value: WalletContextValue = {
    address,
    balanceWei,
    balanceLoading,
    balanceError,
    lastUpdated,
    network,
    blockNumber,
    rpcHost: rpcHost(),
    refresh,
    lock,
    accounts,
    activeIndex,
    switchAccount: onSwitchAccount,
    manageAccounts: onManageAccounts,
    addAccount: onAddAccount,
    known,
    tokens,
    tokenBalances,
    tokenBalancesLoading,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (value === null) {
    throw new Error('useWallet must be used inside WalletProvider');
  }
  return value;
}