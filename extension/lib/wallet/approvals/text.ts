import type { ApprovalsResult } from './types';

// Shown under the list whenever it has rows, and as part of the empty text.
export const LIMITS_TEXT =
  'This list may be incomplete, and it does not cover Permit2 or signed permits.';

export const EMPTY_TEXT = `No active token approvals found. ${LIMITS_TEXT}`;

export const CAPPED_TEXT = 'Showing the 100 most recent approvals found. Older ones may exist.';

// Logs come back oldest first, 1,000 per request, and at most three requests are
// made, so if the last one was still full the NEWEST approvals may be missing.
export const PAGE_FULL_TEXT =
  'Blockscout has more log entries for this account than were read, and they are read oldest first, so newer approvals may be missing from this list.';

export const REMOVAL_TEXT = 'Removing an approval is not available yet.';

// Shown while Blockscout is being asked, once per request.
export function progressText(request: number, maxRequests: number): string {
  return `Checking approvals (request ${request} of up to ${maxRequests})...`;
}

export const VERIFYING_TEXT = 'Checking each approval against the network...';

export const NOT_LOADED_TEXT = 'Approvals have not been loaded for this account yet.';

export const COULD_NOT_CHECK_TEXT =
  'Nerafi could not read the current allowance for these, so it cannot say whether they are active.';

// Notes about what the result may be missing, in plain words.
export function resultNotes(result: ApprovalsResult): string[] {
  const notes: string[] = [];
  if (result.capped) notes.push(CAPPED_TEXT);
  if (result.pageFull) notes.push(PAGE_FULL_TEXT);
  if (result.unreadable > 0) {
    notes.push(`${result.unreadable} entries couldn't be read and are not shown.`);
  }
  if (result.otherEvents > 0) {
    notes.push(
      `${result.otherEvents} other approval ${result.otherEvents === 1 ? 'event' : 'events'} (for example for NFTs) ${result.otherEvents === 1 ? 'was' : 'were'} skipped.`,
    );
  }
  return notes;
}
