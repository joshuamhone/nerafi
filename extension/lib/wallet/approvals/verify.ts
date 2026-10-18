import { erc20Abi, getAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { assertSepolia, createSepoliaClient } from '../network';
import { sanitizeTokenName, sanitizeTokenSymbol } from '../tokenText';
import type { Token } from '../tokens';
import { settleWithLimit } from './limit';
import type {
  ActiveApproval,
  Candidate,
  CouldNotCheck,
  SpenderCode,
  TokenInfo,
} from './types';

// At most this many requests to the public RPC are in flight at once, across
// every kind of read here.
export const VERIFY_CONCURRENCY = 4;

const MAX_DECIMALS = 36;

// The read-only calls this module makes. Every answer is `unknown`, so a mock or
// a hostile contract can return anything and each value is still checked.
export type ApprovalClient = {
  getChainId(): Promise<number>;
  getCode(address: Address): Promise<Hex | undefined>;
  readAllowance(token: Address, owner: Address, spender: Address): Promise<unknown>;
  readSymbol(token: Address): Promise<unknown>;
  readName(token: Address): Promise<unknown>;
  readDecimals(token: Address): Promise<unknown>;
};

export function createApprovalClient(): ApprovalClient {
  const client = createSepoliaClient();
  return {
    getChainId: () => client.getChainId(),
    getCode: (address) => client.getCode({ address }),
    readAllowance: (token, owner, spender) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, spender],
      }),
    readSymbol: (token) =>
      client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    readName: (token) =>
      client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
    readDecimals: (token) =>
      client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  };
}

export type VerifyResult = {
  active: ActiveApproval[];
  couldNotCheck: CouldNotCheck[];
};

function validDecimals(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_DECIMALS
    ? value
    : null;
}

function codeToSpender(settled: PromiseSettledResult<Hex | undefined>): SpenderCode {
  if (settled.status !== 'fulfilled') return 'unknown';
  const code = settled.value;
  if (code === undefined || code === '0x') return 'eoa';
  if (typeof code === 'string' && /^0x[0-9a-fA-F]+$/.test(code)) return 'contract';
  return 'unknown';
}

type MetaField = 'symbol' | 'name' | 'decimals';
type MetaTask = { token: string; field: MetaField };

// Read-only. Reads the CURRENT allowance of every candidate (the chain decides,
// not the old log), keeps only those above zero, then looks up token details and
// whether each spender is a contract. Each read succeeds or fails alone.
export async function verifyApprovals(
  client: ApprovalClient,
  owner: string,
  candidates: Candidate[],
  listedTokens: Token[],
): Promise<VerifyResult> {
  await assertSepolia(client);
  const ownerAddress = getAddress(owner);

  // 1. Allowances.
  const allowances = await settleWithLimit(candidates, VERIFY_CONCURRENCY, (candidate) =>
    client.readAllowance(
      getAddress(candidate.token),
      ownerAddress,
      getAddress(candidate.spender),
    ),
  );
  const couldNotCheck: CouldNotCheck[] = [];
  const activeCandidates: Array<{ candidate: Candidate; allowance: bigint }> = [];
  candidates.forEach((candidate, index) => {
    const settled = allowances[index];
    const value = settled !== undefined && settled.status === 'fulfilled' ? settled.value : undefined;
    if (typeof value !== 'bigint' || value < 0n) {
      couldNotCheck.push({ token: candidate.token, spender: candidate.spender });
      return;
    }
    // A zero allowance is not an active approval.
    if (value > 0n) activeCandidates.push({ candidate, allowance: value });
  });

  // 2. Token details, only for tokens that matter and are not already in the
  //    user's list (a listed token keeps the details the user confirmed).
  const listedByAddress = new Map(listedTokens.map((token) => [token.address.toLowerCase(), token]));
  const unlistedTokens: string[] = [];
  const seenTokens = new Set<string>();
  for (const { candidate } of activeCandidates) {
    const key = candidate.token.toLowerCase();
    if (seenTokens.has(key)) continue;
    seenTokens.add(key);
    if (!listedByAddress.has(key)) unlistedTokens.push(candidate.token);
  }
  const metaTasks: MetaTask[] = unlistedTokens.flatMap((token) => [
    { token, field: 'symbol' as const },
    { token, field: 'name' as const },
    { token, field: 'decimals' as const },
  ]);
  const metaResults = await settleWithLimit(metaTasks, VERIFY_CONCURRENCY, (task) => {
    const address = getAddress(task.token);
    if (task.field === 'symbol') return client.readSymbol(address);
    if (task.field === 'name') return client.readName(address);
    return client.readDecimals(address);
  });
  const metadata = new Map<string, { symbol: string | null; name: string | null; decimals: number | null }>();
  metaTasks.forEach((task, index) => {
    const key = task.token.toLowerCase();
    const entry = metadata.get(key) ?? { symbol: null, name: null, decimals: null };
    const settled = metaResults[index];
    const value = settled !== undefined && settled.status === 'fulfilled' ? settled.value : undefined;
    if (task.field === 'symbol' && typeof value === 'string') entry.symbol = sanitizeTokenSymbol(value);
    if (task.field === 'name' && typeof value === 'string') entry.name = sanitizeTokenName(value);
    if (task.field === 'decimals') entry.decimals = validDecimals(value);
    metadata.set(key, entry);
  });

  // 3. Is each spender a contract? A failed lookup is 'unknown', never 'eoa'.
  const spenders: string[] = [];
  const seenSpenders = new Set<string>();
  for (const { candidate } of activeCandidates) {
    const key = candidate.spender.toLowerCase();
    if (seenSpenders.has(key)) continue;
    seenSpenders.add(key);
    spenders.push(candidate.spender);
  }
  const codeResults = await settleWithLimit(spenders, VERIFY_CONCURRENCY, (spender) =>
    client.getCode(getAddress(spender)),
  );
  const spenderCodes = new Map<string, SpenderCode>();
  spenders.forEach((spender, index) => {
    const settled = codeResults[index];
    spenderCodes.set(
      spender.toLowerCase(),
      settled === undefined ? 'unknown' : codeToSpender(settled),
    );
  });

  const active: ActiveApproval[] = activeCandidates.map(({ candidate, allowance }) => {
    const key = candidate.token.toLowerCase();
    const listed = listedByAddress.get(key);
    let tokenInfo: TokenInfo;
    if (listed !== undefined) {
      tokenInfo = {
        symbol: listed.symbol,
        name: listed.name,
        decimals: listed.decimals,
        listed: true,
        metadataComplete: true,
      };
    } else {
      const found = metadata.get(key) ?? { symbol: null, name: null, decimals: null };
      tokenInfo = {
        symbol: found.symbol,
        name: found.name,
        decimals: found.decimals,
        listed: false,
        metadataComplete:
          found.symbol !== null && found.name !== null && found.decimals !== null,
      };
    }
    return {
      token: candidate.token,
      spender: candidate.spender,
      allowance,
      tokenInfo,
      spenderCode: spenderCodes.get(candidate.spender.toLowerCase()) ?? 'unknown',
    };
  });

  return { active, couldNotCheck };
}
