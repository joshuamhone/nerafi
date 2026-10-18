import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { FindingList } from '../../../components/FindingList';
import { Notice } from '../../../components/Notice';
import { RefreshIcon } from '../../../components/icons';
import { REFRESH_COOLDOWN_MS } from '../../../lib/wallet/approvals/cooldown';
import { loadApprovals } from '../../../lib/wallet/approvals/load';
import type { LoadProgress } from '../../../lib/wallet/approvals/load';
import { fetchApprovalLogs, MAX_LOG_REQUESTS } from '../../../lib/wallet/approvals/fetch';
import { formatAllowance } from '../../../lib/wallet/approvals/format';
import { buildApprovalRows } from '../../../lib/wallet/approvals/sort';
import type { ApprovalRowData } from '../../../lib/wallet/approvals/sort';
import { ApprovalsError } from '../../../lib/wallet/approvals/parse';
import {
  clearLoadedApprovals,
  getLoadedApprovals,
  setLoadedApprovals,
} from '../../../lib/wallet/approvals/store';
import {
  COULD_NOT_CHECK_TEXT,
  EMPTY_TEXT,
  LIMITS_TEXT,
  NOT_LOADED_TEXT,
  progressText,
  REMOVAL_TEXT,
  resultNotes,
  VERIFYING_TEXT,
} from '../../../lib/wallet/approvals/text';
import type { SpenderCode } from '../../../lib/wallet/approvals/types';
import { createApprovalClient } from '../../../lib/wallet/approvals/verify';
import { NetworkError } from '../../../lib/wallet/network';
import { useWallet } from '../context';
import './ApprovalsPage.css';

const SPENDER_LABEL: Record<SpenderCode, string> = {
  contract: 'Contract',
  eoa: 'Wallet',
  unknown: 'Could not check',
};

function errorText(err: unknown): string {
  if (err instanceof ApprovalsError) return err.message;
  if (err instanceof NetworkError) return err.message;
  return 'Could not check your approvals. Try again in a moment.';
}

// One row of the list. Its findings and its place in the list are worked out
// before it gets here (see buildApprovalRows).
function ApprovalRow({ row }: { row: ApprovalRowData }) {
  const { approval, findings } = row;
  return (
    <li className="approval">
      <div className="approval-top">
        <span className="approval-token">{approval.tokenInfo.symbol ?? 'Unnamed token'}</span>
        <span className="approval-amount tabular">
          {formatAllowance(approval.allowance, approval.tokenInfo.decimals)}
        </span>
      </div>

      <dl className="approval-details">
        <div className="approval-detail">
          <dt>Token contract</dt>
          <dd>
            <AddressText value={approval.token} />
          </dd>
        </div>
        <div className="approval-detail">
          <dt>
            Spender <span className="approval-kind">{SPENDER_LABEL[approval.spenderCode]}</span>
          </dt>
          <dd>
            <AddressText value={approval.spender} />
          </dd>
        </div>
      </dl>

      {findings.length > 0 && <FindingList findings={findings} />}
    </li>
  );
}

export function ApprovalsPage() {
  const { address, tokens, known } = useWallet();
  const [loading, setLoading] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<LoadProgress>(1);
  // Bumped whenever the shared store changes, so this page re-reads it.
  const [, setVersion] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const cooldownRef = useRef<number | null>(null);
  // The latest account and token list, read when a load starts or finishes.
  const addressRef = useRef(address);
  const tokensRef = useRef(tokens);
  useEffect(() => {
    addressRef.current = address;
    tokensRef.current = tokens;
  }, [address, tokens]);

  // Discovery makes a request to Blockscout, so it runs only when this page is
  // opened or Refresh is pressed: never on startup, on an account switch, from the
  // Security Center, or as an automatic retry.
  const run = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const owner = addressRef.current;
    setLoading(true);
    setError('');
    setProgress(1);
    void (async () => {
      try {
        const result = await loadApprovals(
          { fetchLogs: fetchApprovalLogs, client: createApprovalClient() },
          owner,
          tokensRef.current,
          controller.signal,
          (step) => {
            if (!controller.signal.aborted) setProgress(step);
          },
        );
        // Dropped if the page was left, a newer load started, or the account
        // changed while this one was running.
        if (controller.signal.aborted || owner !== addressRef.current) return;
        setLoadedApprovals(owner, result);
        setVersion((v) => v + 1);
      } catch (err) {
        if (controller.signal.aborted || owner !== addressRef.current) return;
        // A failed load is an error state only: whatever was shown before is
        // dropped, so an out-of-date or partial list is never shown as current.
        clearLoadedApprovals();
        setVersion((v) => v + 1);
        setError(errorText(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
  }, []);

  // Opening the page loads once if nothing is stored for this account. The
  // zero-delay timer is cancelled by the cleanup, so React's development double
  // mount sends one request, not two.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (getLoadedApprovals(addressRef.current) === 'not loaded') run();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [run]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current !== null) window.clearTimeout(cooldownRef.current);
    };
  }, []);

  function refresh() {
    setCoolingDown(true);
    if (cooldownRef.current !== null) window.clearTimeout(cooldownRef.current);
    cooldownRef.current = window.setTimeout(() => setCoolingDown(false), REFRESH_COOLDOWN_MS);
    run();
  }

  const selection = getLoadedApprovals(address);
  // The rows, riskiest first. The "couldn't check" list below is not sorted.
  const rows = useMemo(
    () => (selection === 'not loaded' ? [] : buildApprovalRows(selection.active, known)),
    [selection, known],
  );

  return (
    <section className="page">
      <header className="page-header approvals-header">
        <h1 className="page-title">Approvals</h1>
        <Button variant="secondary" onClick={refresh} disabled={loading || coolingDown}>
          <RefreshIcon size={14} />
          {loading ? 'Checking…' : 'Refresh'}
        </Button>
      </header>

      <div className="approvals-width">
        <p className="approvals-lead">
          Permissions you have given other addresses to move your tokens. Each one found in
          the activity log is checked against the current state of the network. This page only
          reads. {REMOVAL_TEXT}
        </p>

        {loading && (
          <p className="approvals-progress" role="status">
            {progress === 'verifying' ? VERIFYING_TEXT : progressText(progress, MAX_LOG_REQUESTS)}
          </p>
        )}

        {error !== '' && <Notice variant="alert">{error}</Notice>}

        {selection === 'not loaded' && loading && (
          <div className="approvals-skeletons" aria-hidden="true">
            <span className="approvals-skeleton" />
            <span className="approvals-skeleton" />
          </div>
        )}

        {selection === 'not loaded' && !loading && error === '' && (
          <p className="approvals-state">{NOT_LOADED_TEXT}</p>
        )}

        {selection !== 'not loaded' && (
          <>
            {selection.active.length === 0 ? (
              <p className="approvals-state">{EMPTY_TEXT}</p>
            ) : (
              <>
                <ul className="approvals-list">
                  {rows.map((row) => (
                    <ApprovalRow
                      key={`${row.approval.token}:${row.approval.spender}`}
                      row={row}
                    />
                  ))}
                </ul>
                <p className="approvals-limits">{LIMITS_TEXT}</p>
              </>
            )}

            {resultNotes(selection).map((note) => (
              <Notice key={note} variant="info">
                {note}
              </Notice>
            ))}

            {selection.couldNotCheck.length > 0 && (
              <section className="panel approvals-unchecked" aria-labelledby="unchecked-title">
                <h2 className="panel-title" id="unchecked-title">
                  Couldn't check
                </h2>
                <p className="approvals-limits">{COULD_NOT_CHECK_TEXT}</p>
                <ul className="approvals-list">
                  {selection.couldNotCheck.map((item) => (
                    <li key={`${item.token}:${item.spender}`} className="approval">
                      <dl className="approval-details">
                        <div className="approval-detail">
                          <dt>Token contract</dt>
                          <dd>
                            <AddressText value={item.token} />
                          </dd>
                        </div>
                        <div className="approval-detail">
                          <dt>Spender</dt>
                          <dd>
                            <AddressText value={item.spender} />
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
