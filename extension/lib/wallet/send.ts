import { formatEther, getAddress, isAddress, parseEther } from 'viem';
import type { Address, Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { assertSepolia, SEPOLIA_CHAIN_ID } from './network';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const AMOUNT_PATTERN = /^\d+(\.\d{1,18})?$/;

export type RecipientResult =
  | { ok: true; address: Address; isSelf: boolean }
  | { ok: false; error: string };

export function parseRecipient(input: string, ownAddress: string): RecipientResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Enter a recipient address.' };
  }
  if (!isAddress(trimmed, { strict: false })) {
    return { ok: false, error: 'That is not a valid Ethereum address.' };
  }
  if (!isAddress(trimmed)) {
    return { ok: false, error: 'That address has an invalid checksum. Check it for typos.' };
  }
  const address = getAddress(trimmed);
  if (address === ZERO_ADDRESS) {
    return { ok: false, error: 'The zero address cannot receive funds.' };
  }
  const isSelf = address.toLowerCase() === ownAddress.trim().toLowerCase();
  return { ok: true, address, isSelf };
}

export type AmountResult = { ok: true; wei: bigint } | { ok: false; error: string };

export function parseAmount(input: string): AmountResult {
  const trimmed = input.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) {
    return { ok: false, error: 'Enter a valid amount.' };
  }
  const wei = parseEther(trimmed);
  if (wei <= 0n) {
    return { ok: false, error: 'Enter an amount greater than zero.' };
  }
  return { ok: true, wei };
}

export type ReviewInput = {
  from: Address;
  to: Address;
  valueWei: bigint;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  balanceWei: bigint;
};

export type Review = ReviewInput & {
  maxFeeWei: bigint;
  totalMaxWei: bigint;
  sufficient: boolean;
};

export function buildReview(params: ReviewInput): Review {
  const maxFeeWei = params.gas * params.maxFeePerGas;
  const totalMaxWei = params.valueWei + maxFeeWei;
  return {
    ...params,
    maxFeeWei,
    totalMaxWei,
    sufficient: params.balanceWei >= totalMaxWei,
  };
}

export function explainReview(review: Review): string {
  return (
    `You are sending ${formatEther(review.valueWei)} test ETH to ${review.to}. ` +
    `The network fee is at most ${formatEther(review.maxFeeWei)} test ETH. ` +
    `In total, at most ${formatEther(review.totalMaxWei)} test ETH will leave your wallet. ` +
    `Network: Sepolia testnet.`
  );
}

export type TransferClient = {
  getChainId(): Promise<number>;
  getTransactionCount(args: { address: Address; blockTag: 'pending' }): Promise<number>;
  sendRawTransaction(args: { serializedTransaction: Hex }): Promise<Hex>;
};

export async function submitTransfer(
  deps: { client: TransferClient },
  phrase: string,
  review: Review,
): Promise<Hex> {
  const account = mnemonicToAccount(phrase);
  if (account.address.toLowerCase() !== review.from.toLowerCase()) {
    throw new Error('The recovery phrase does not match this wallet.');
  }

  await assertSepolia(deps.client);

  const nonce = await deps.client.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });

  const serializedTransaction = await account.signTransaction({
    type: 'eip1559',
    chainId: SEPOLIA_CHAIN_ID,
    nonce,
    to: review.to,
    value: review.valueWei,
    gas: review.gas,
    maxFeePerGas: review.maxFeePerGas,
    maxPriorityFeePerGas: review.maxPriorityFeePerGas,
  });

  return deps.client.sendRawTransaction({ serializedTransaction });
}
