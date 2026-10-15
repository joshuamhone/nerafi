import { describe, expect, it } from 'vitest';
import { THREATS } from './threats';

describe('the threats the Security Center lists', () => {
  it('lists exactly the five threats', () => {
    expect(THREATS.map((t) => t.id)).toEqual([
      'phishing_sites',
      'malicious_approvals',
      'address_poisoning',
      'blind_signing',
      'phrase_theft',
    ]);
  });

  it('says plainly that phishing sites and malicious approvals are not covered yet', () => {
    for (const id of ['phishing_sites', 'malicious_approvals']) {
      const threat = THREATS.find((t) => t.id === id);
      expect(threat?.coverage).toBe('not_covered');
      expect(threat?.doesNot).toContain('not covered yet');
    }
  });

  it('gives every threat one sentence for what Nerafi does and one for what it does not', () => {
    for (const threat of THREATS) {
      expect(threat.does.length).toBeGreaterThan(20);
      expect(threat.doesNot.length).toBeGreaterThan(20);
      expect(threat.does).not.toContain('. ');
      expect(threat.doesNot).not.toContain('. ');
    }
  });

  it('never claims to make anything safe, secure or verified', () => {
    for (const threat of THREATS) {
      const text = `${threat.name} ${threat.does} ${threat.doesNot}`.toLowerCase();
      for (const word of ['safe', 'secure', 'verified', 'guarantee', 'protects you from all']) {
        expect(text).not.toContain(word);
      }
    }
  });
});
