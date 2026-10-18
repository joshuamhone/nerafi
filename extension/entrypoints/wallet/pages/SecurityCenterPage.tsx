import { browser } from 'wxt/browser';
import { FindingList } from '../../../components/FindingList';
import { Notice } from '../../../components/Notice';
import { assessApprovalsForSecurityCenter } from '../../../lib/wallet/approvals/securityCenter';
import { getLoadedApprovals } from '../../../lib/wallet/approvals/store';
import { PART_FAILURE_NOTES } from '../../../lib/wallet/history/combined';
import { getLoadedHistory } from '../../../lib/wallet/history/loaded';
import { NO_WARNINGS_TEXT } from '../../../lib/wallet/risk/gate';
import {
  assessWallet,
  devBuildNoteFor,
  PERMISSIONS_SELF_REPORT_TEXT,
} from '../../../lib/wallet/risk/posture';
import type { ManifestLike } from '../../../lib/wallet/risk/posture';
import { THREATS } from '../../../lib/wallet/risk/threats';
import { sortFindings } from '../../../lib/wallet/risk/types';
import type { SecurityLogEntry } from '../../../lib/wallet/securityLog';
import { autoLockLabel } from '../../../lib/wallet/settings';
import type { AutoLockMinutes } from '../../../lib/wallet/settings';
import { useWallet } from '../context';
import { routeHref } from '../router';
import './SecurityCenterPage.css';

type SecurityCenterPageProps = {
  autoLockMinutes: AutoLockMinutes;
  log: SecurityLogEntry[];
};

function readManifest(): ManifestLike {
  try {
    return browser.runtime.getManifest();
  } catch {
    // An unreadable manifest is reported as a finding, never as a pass.
    return {};
  }
}

const COVERAGE_WORD = {
  partial: 'Partly covered',
  not_covered: 'Not covered yet',
} as const;

// Reads only what is already stored or loaded on this computer; it makes no
// request of its own. The findings are advisory and heuristic.
export function SecurityCenterPage({ autoLockMinutes, log }: SecurityCenterPageProps) {
  const { address, known, tokens } = useWallet();
  const loaded = getLoadedHistory(address);

  const report = assessWallet({
    autoLockMinutes,
    securityLog: log,
    now: Date.now(),
    loadedActivity: loaded === null ? null : loaded.items,
    known,
    tokens,
    manifest: readManifest(),
  });

  // The approvals check reads only the in-memory result for this account.
  const approvalsCheck = assessApprovalsForSecurityCenter(getLoadedApprovals(address));
  const findings = sortFindings([...report.findings, ...approvalsCheck.findings]);
  const skipped = [...report.skipped, ...approvalsCheck.skipped];

  const attention = findings.filter((finding) => finding.severity !== 'info');
  const notes = findings.filter((finding) => finding.severity === 'info');
  const devBuildNote = devBuildNoteFor(findings);

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Security Center</h1>
      </header>

      <div className="security-width">
        <p className="security-lead">
          These checks use only what is already stored or loaded on this computer. They are
          advice based on rules of thumb, not proof, and they do not change anything you sign.
        </p>

        <section className="panel security-section" aria-labelledby="needs-attention">
          <h2 className="panel-title" id="needs-attention">
            Needs attention
          </h2>
          {attention.length === 0 ? (
            <p className="security-none">{NO_WARNINGS_TEXT}</p>
          ) : (
            <FindingList findings={attention} />
          )}

          {devBuildNote !== null && <p className="security-selfreport">{devBuildNote}</p>}

          {skipped.map((text) => (
            <Notice key={text} variant="info">
              {text}
            </Notice>
          ))}

          {loaded !== null && loaded.failedParts.length > 0 && (
            <Notice variant="info">
              Activity was only partly loaded ({loaded.failedParts
                .map((part) => PART_FAILURE_NOTES[part].replace(/\.$/, ''))
                .join('; ')}
              ), so the checks on it may miss something.
            </Notice>
          )}
        </section>

        {notes.length > 0 && (
          <section className="panel security-section" aria-labelledby="for-info">
            <h2 className="panel-title" id="for-info">
              For your information
            </h2>
            <FindingList findings={notes} />
            <p className="security-selfreport">{PERMISSIONS_SELF_REPORT_TEXT}</p>
          </section>
        )}

        <section className="panel security-section" aria-labelledby="change-things">
          <h2 className="panel-title" id="change-things">
            Your settings
          </h2>
          <p className="security-text">
            Auto-lock is set to {autoLockLabel(autoLockMinutes)}. The security log, auto-lock and
            password are on the{' '}
            <a className="security-link" href={routeHref('settings')}>
              Settings page
            </a>
            .
          </p>
        </section>

        <section className="panel security-section" aria-labelledby="watches">
          <h2 className="panel-title" id="watches">
            What Nerafi watches for
          </h2>
          <ul className="threats">
            {THREATS.map((threat) => (
              <li key={threat.id} className="threat">
                <p className="threat-name">
                  {threat.name}
                  <span className="threat-coverage">{COVERAGE_WORD[threat.coverage]}</span>
                </p>
                <p className="threat-does">{threat.does}</p>
                <p className="threat-doesnot">{threat.doesNot}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
