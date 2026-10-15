// On Sepolia, a native ETH transfer is also written to the transaction's logs as
// an ERC-20-style Transfer(sender, receiver, value) event. The log's emitting
// address is this fixed system address (the EIP-7708 behaviour). Blockscout then
// reports it in the token-transfers list as an "ERC-20" transfer of a token with
// no symbol, name or decimals.
//
// Verified against live data for transaction
// 0x3ca85c211ccd03b064e1e8ae7f698683f4f21a689f3c4e0332095eb63ed51ec5: a plain ETH
// send between two ordinary accounts whose single log was emitted from this
// address, with event data equal to the transaction's value. Blockscout reports
// no contract at this address. The EVM sets a log's address to the account whose
// code emitted it, so contract code cannot emit a log under another address; a
// token cannot impersonate this one.
//
// These events are not tokens. They are matched by this exact address only
// (case-insensitive). Nothing is hidden because its metadata is null: a real
// token that reports null metadata still shows as an unlisted token.
export const NATIVE_ETH_LOG_ADDRESS = '0xfffffffffffffffffffffffffffffffffffffffe';

export function isNativeEthLogAddress(address: string): boolean {
  return address.trim().toLowerCase() === NATIVE_ETH_LOG_ADDRESS;
}
