import type { Finding, Severity } from '../lib/wallet/risk/types';
import './FindingList.css';

const SEVERITY_WORD: Record<Severity, string> = {
  danger: 'Danger',
  caution: 'Caution',
  info: 'Note',
};

type FindingListProps = {
  findings: Finding[];
  onPaper?: boolean;
};

// One finding per item: what it is, what it means, what to do. The severity is
// written out as a word so it never depends on colour alone.
export function FindingList({ findings, onPaper = false }: FindingListProps) {
  const classes = onPaper ? 'findings findings--paper' : 'findings';
  return (
    <ul className={classes}>
      {findings.map((finding) => (
        <li key={finding.id} className={`finding finding--${finding.severity}`}>
          <p className="finding-title">
            <span className="finding-severity">{SEVERITY_WORD[finding.severity]}</span>
            {finding.title}
          </p>
          <p className="finding-explanation">{finding.explanation}</p>
          <p className="finding-action">{finding.action}</p>
        </li>
      ))}
    </ul>
  );
}
