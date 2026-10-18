// Read-only ERC-20 allowances the active account has granted. Everything here
// describes data; nothing in lib/wallet/approvals/ signs, builds a transaction or
// encodes a write.

// An ERC-20 Approval(owner, spender, value) log from Blockscout. The log says an
// approval was once granted; the CURRENT allowance is read from the chain.
export type ApprovalLog = {
  // The token contract that emitted the log (checksummed).
  token: string;
  owner: string;
  spender: string;
  // The value in the log. Not trusted as the current allowance.
  value: bigint;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: string;
};

export type ParsedApprovalLogs = {
  approvals: ApprovalLog[];
  // 4-topic Approval logs (ERC-721 style). Counted, never "unreadable".
  otherEvents: number;
  // Items that could not be read.
  unreadable: number;
  // How many items the response held, so parsed + other + unreadable === total.
  total: number;
};

// What fetching all pages of logs produced: the parsed counts plus whether the
// last page requested was still full (so more logs may exist than were read).
export type FetchedApprovalLogs = ParsedApprovalLogs & {
  incomplete: boolean;
  requests: number;
};

export type Candidate = {
  token: string;
  spender: string;
  // The newest log seen for this pair, used only to order candidates.
  blockNumber: bigint;
  logIndex: number;
};

export type SpenderCode = 'contract' | 'eoa' | 'unknown';

export type TokenInfo = {
  // Sanitised. null when the read failed.
  symbol: string | null;
  name: string | null;
  // null when unreadable: the amount then reads "Amount unavailable".
  decimals: number | null;
  // True when the token is in the user's own list.
  listed: boolean;
  // False when any of symbol, name or decimals could not be read.
  metadataComplete: boolean;
};

// An approval whose CURRENT allowance was read from the chain and is above zero.
export type ActiveApproval = {
  token: string;
  spender: string;
  allowance: bigint;
  tokenInfo: TokenInfo;
  spenderCode: SpenderCode;
};

// A candidate whose allowance could not be read. Never shown as active, never
// dropped silently.
export type CouldNotCheck = {
  token: string;
  spender: string;
};

export type ApprovalsResult = {
  owner: string;
  active: ActiveApproval[];
  couldNotCheck: CouldNotCheck[];
  // Parser counts, for the "N entries couldn't be read" pattern.
  unreadable: number;
  otherEvents: number;
  // More than the cap of distinct (token, spender) pairs existed.
  capped: boolean;
  // The last page of logs read was still full, so newer logs may be missing.
  pageFull: boolean;
};
