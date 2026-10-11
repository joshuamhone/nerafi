import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isAddress } from 'viem';
import { createSepoliaClient, SEPOLIA_CHAIN_ID, SEPOLIA_RPC_URL } from '../../lib/wallet/network';

export type NetworkStatus = 'checking' | 'reachable' | 'unreachable';

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
  children: ReactNode;
};

export function WalletProvider({ address, onLock, children }: WalletProviderProps) {
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [network, setNetwork] = useState<NetworkStatus>('checking');
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);

  const refresh = useCallback(() => {
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

  useEffect(() => {
    return refresh();
  }, [refresh]);

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