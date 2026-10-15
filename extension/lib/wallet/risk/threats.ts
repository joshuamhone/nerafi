// The five threats the Security Center describes, each with one honest sentence
// about what Nerafi does today and one about what it does not do yet. Kept as
// data so the wording can be tested: a threat Nerafi does not cover must say so.

export type Coverage = 'partial' | 'not_covered';

export type Threat = {
  id: string;
  name: string;
  coverage: Coverage;
  does: string;
  doesNot: string;
};

export const THREATS: Threat[] = [
  {
    id: 'phishing_sites',
    name: 'Phishing sites',
    coverage: 'not_covered',
    does: 'Nerafi does not connect to websites at all today, so a website cannot ask it to sign anything.',
    doesNot: 'Phishing sites are not covered yet: Nerafi cannot recognise or block a fake website.',
  },
  {
    id: 'malicious_approvals',
    name: 'Malicious approvals',
    coverage: 'not_covered',
    does: 'Nerafi cannot send tokens or create an approval, so it cannot grant one by itself.',
    doesNot:
      'Malicious approvals are not covered yet: Nerafi does not list or revoke approvals you gave elsewhere.',
  },
  {
    id: 'address_poisoning',
    name: 'Address poisoning',
    coverage: 'partial',
    does: 'Nerafi compares a recipient with your accounts, contacts and past recipients, warns about lookalikes, and flags zero-value transfers and lookalike senders in your history.',
    doesNot:
      'It cannot catch a lookalike of an address you have never saved or sent to, and a warning is advice, not proof.',
  },
  {
    id: 'blind_signing',
    name: 'Blind signing',
    coverage: 'partial',
    does: 'Nerafi only signs a plain ETH transfer and shows the recipient, amount, fee and total in full before you sign.',
    doesNot:
      'It cannot yet decode what a contract would do with your ETH, so it only tells you when the recipient is a contract.',
  },
  {
    id: 'phrase_theft',
    name: 'Phrase theft',
    coverage: 'partial',
    does: 'Your recovery phrase is stored encrypted with your password, is not kept while the wallet is unlocked, and there is no copy button.',
    doesNot:
      'It cannot protect a phrase you type into a fake site, or anything on a computer that already has malware.',
  },
];
