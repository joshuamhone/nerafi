import { describe, expect, it } from 'vitest';
import {
  CAPPED_TEXT,
  EMPTY_TEXT,
  LIMITS_TEXT,
  PAGE_FULL_TEXT,
  progressText,
  REMOVAL_TEXT,
  resultNotes,
  VERIFYING_TEXT,
} from './text';
import type { ApprovalsResult } from './types';

const base: ApprovalsResult = {
  owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  active: [],
  couldNotCheck: [],
  unreadable: 0,
  otherEvents: 0,
  capped: false,
  pageFull: false,
};

describe('the fixed sentences', () => {
  it('the empty state is exact', () => {
    expect(EMPTY_TEXT).toBe(
      'No active token approvals found. This list may be incomplete, and it does not cover Permit2 or signed permits.',
    );
  });

  it('the limit sentence under a list is the same limit as in the empty state', () => {
    expect(LIMITS_TEXT).toBe(
      'This list may be incomplete, and it does not cover Permit2 or signed permits.',
    );
    expect(EMPTY_TEXT.endsWith(LIMITS_TEXT)).toBe(true);
  });

  it('the cap sentence is exact', () => {
    expect(CAPPED_TEXT).toBe('Showing the 100 most recent approvals found. Older ones may exist.');
  });

  it('the only sentence about removal says it is not available yet', () => {
    expect(REMOVAL_TEXT).toBe('Removing an approval is not available yet.');
  });

  it('the full-page note warns that NEWER approvals may be missing, because logs come oldest first', () => {
    expect(PAGE_FULL_TEXT).toContain('oldest first');
    expect(PAGE_FULL_TEXT).toContain('newer approvals may be missing');
  });
});

describe('resultNotes', () => {
  it('has no notes for a clean result', () => {
    expect(resultNotes(base)).toEqual([]);
  });

  it('reports the cap, a full page, unreadable entries and other events', () => {
    const notes = resultNotes({
      ...base,
      capped: true,
      pageFull: true,
      unreadable: 2,
      otherEvents: 3,
    });
    expect(notes).toContain(CAPPED_TEXT);
    expect(notes).toContain(PAGE_FULL_TEXT);
    expect(notes).toContain("2 entries couldn't be read and are not shown.");
    expect(notes.some((note) => note.startsWith('3 other approval events'))).toBe(true);
  });

  it('keeps "other approval events" apart from unreadable entries', () => {
    const notes = resultNotes({ ...base, otherEvents: 1 });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('1 other approval event');
    expect(notes[0]).not.toContain("couldn't be read");
  });
});

describe('progressText', () => {
  it('names the request number out of up to three', () => {
    expect(progressText(1, 3)).toBe('Checking approvals (request 1 of up to 3)...');
    expect(progressText(2, 3)).toBe('Checking approvals (request 2 of up to 3)...');
    expect(progressText(3, 3)).toBe('Checking approvals (request 3 of up to 3)...');
  });

  it('follows the page number it is given', () => {
    for (const request of [1, 2, 3]) {
      expect(progressText(request, 3)).toContain(`request ${request} of`);
    }
  });

  it('has its own text for the on-chain checks that follow', () => {
    expect(VERIFYING_TEXT).toBe('Checking each approval against the network...');
  });
});
