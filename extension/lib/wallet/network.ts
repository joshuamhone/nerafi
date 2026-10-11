import { createPublicClient, http } from 'viem';
import type { Address } from 'viem';
import { sepolia } from 'viem/chains';

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
export const EXPLORER_TX_URL = 'https://sepolia.etherscan.io/tx/';

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function createSepoliaClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
  });
}

export async function assertSepolia(client: { getChainId(): Promise<number> }): Promise<void> {
  const chainId = await client.getChainId();
  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new NetworkError('Wrong network. Nerafi only signs on Sepolia.');
  }
}

export async function getBalanceWei(
  client: { getBalance(args: { address: Address }): Promise<bigint> },
  address: Address,
): Promise<bigint> {
  return client.getBalance({ address });
}
