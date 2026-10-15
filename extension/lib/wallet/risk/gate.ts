import type { RiskReport } from './types';

export const NO_WARNINGS_TEXT = 'No warnings found. This is not a guarantee.';
export const CHECKING_ADDRESS_TEXT = 'Checking this address...';

// The signing gate for the risk report: a report with any 'danger' finding
// cannot be signed until the user has acknowledged it. Caution and info
// findings never block. This sits next to canSign (the lookalike gate); both
// are used, with one shared acknowledgement.
export function canSignReport(report: RiskReport, acknowledged: boolean): boolean {
  const hasDanger = report.findings.some((finding) => finding.severity === 'danger');
  return !(hasDanger && !acknowledged);
}

export function hasDanger(report: RiskReport): boolean {
  return report.findings.some((finding) => finding.severity === 'danger');
}

// The one checkbox's wording. It names the danger instead of saying a generic
// "I understand". When the only danger is a lookalike recipient the original
// sentence is kept.
export function acknowledgementLabel(
  report: RiskReport,
  lookalikeLabel: string | null,
): string {
  const dangers = report.findings.filter((finding) => finding.severity === 'danger');
  if (dangers.length === 0) return '';
  const only = dangers[0];
  if (
    dangers.length === 1 &&
    only !== undefined &&
    only.id === 'lookalike_recipient' &&
    lookalikeLabel !== null
  ) {
    return `I have checked every character. This is not ${lookalikeLabel}.`;
  }
  const titles = dangers.map((finding) => finding.title).join('; ');
  return dangers.length === 1
    ? `I have read the warning "${titles}" and I still want to send.`
    : `I have read these warnings: ${titles}. I still want to send.`;
}
