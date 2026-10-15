// Findings are advisory. They explain something worth a second look; they never
// change what is signed, and there is deliberately no numeric score.

export type Severity = 'info' | 'caution' | 'danger';

export type Finding = {
  // Stable, machine-readable id (for example "lookalike_recipient").
  id: string;
  severity: Severity;
  title: string;
  // One or two plain sentences: what this means.
  explanation: string;
  // One plain sentence: what to do.
  action: string;
};

export type RiskLevel = Severity | 'none';

export type RiskReport = {
  // Sorted danger, then caution, then info.
  findings: Finding[];
  // The highest severity among the findings, or 'none'.
  level: RiskLevel;
  // Checks that ran to completion.
  checksRun: string[];
  // Checks that could not run (for example the contract lookup failing).
  checksFailed: string[];
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  danger: 0,
  caution: 1,
  info: 2,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return findings
    .map((finding, order) => ({ finding, order }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity] ||
        a.order - b.order,
    )
    .map((entry) => entry.finding);
}

export function highestSeverity(findings: Finding[]): RiskLevel {
  let level: RiskLevel = 'none';
  let best = Number.POSITIVE_INFINITY;
  for (const finding of findings) {
    const rank = SEVERITY_ORDER[finding.severity];
    if (rank < best) {
      best = rank;
      level = finding.severity;
    }
  }
  return level;
}
