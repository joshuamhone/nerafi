import { getAddress } from 'viem';
import { SEPOLIA_CHAIN_ID } from './network';

export function buildReceiveUri(address: string): string {
  return `ethereum:${getAddress(address)}@${SEPOLIA_CHAIN_ID}`;
}