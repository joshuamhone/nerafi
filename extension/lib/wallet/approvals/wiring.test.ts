import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source-text checks, because the project has no component test library. They
// confirm the wiring is present and in order; they do not run the screens.

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

const app = source('../../../entrypoints/wallet/App.tsx');
const context = source('../../../entrypoints/wallet/context.tsx');
const sidebar = source('../../../entrypoints/wallet/shell/Sidebar.tsx');
const router = source('../../../entrypoints/wallet/router.ts');
const page = source('../../../entrypoints/wallet/pages/ApprovalsPage.tsx');
const security = source('../../../entrypoints/wallet/pages/SecurityCenterPage.tsx');

function functionBody(text: string, name: string): string {
  const start = text.indexOf(`function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const candidates = [
    text.indexOf('\n  async function ', start + 10),
    text.indexOf('\n  function ', start + 10),
    text.indexOf('\n  const ', start + 10),
    text.indexOf('\n  return (', start + 10),
  ].filter((index) => index > start);
  return text.slice(start, candidates.length > 0 ? Math.min(...candidates) : text.length);
}

// The text of the catch block of the page's load.
function catchBody(): string {
  const start = page.indexOf('} catch (err) {');
  const end = page.indexOf('} finally {');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return page.slice(start, end);
}

describe('approvals never outlive their account', () => {
  it('are cleared on lock and on account switch', () => {
    expect(functionBody(app, 'handleLock')).toContain('clearLoadedApprovals()');
    expect(functionBody(app, 'handleSwitchAccount')).toContain('clearLoadedApprovals()');
  });

  it('are cleared when the session expires by itself', () => {
    const expiry = app.indexOf('if (unlockedAddress === null) {');
    expect(expiry).toBeGreaterThanOrEqual(0);
    const near = app.slice(expiry, expiry + 200);
    expect(near).toContain('clearLoadedHistory()');
    expect(near).toContain('clearLoadedApprovals()');
  });

  it('are cleared wherever the loaded history is cleared, and when the wallet provider goes away', () => {
    const history = (app.match(/clearLoadedHistory\(\)/g) ?? []).length;
    const approvals = (app.match(/clearLoadedApprovals\(\)/g) ?? []).length;
    expect(approvals).toBe(history);
    expect(context).toContain('clearLoadedApprovals()');
  });
});

describe('a stale load is ignored', () => {
  it('the page stores a result only if its own load is still current for this account', () => {
    const store = page.indexOf('setLoadedApprovals(owner, result)');
    const guard = page.indexOf(
      'if (controller.signal.aborted || owner !== addressRef.current) return;',
    );
    expect(store).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(store);
  });

  it('the page aborts its load when it is left or a newer load starts', () => {
    expect(page).toContain('controllerRef.current?.abort()');
  });

  it('the page reads only what is stored for the active account', () => {
    expect(page).toContain('getLoadedApprovals(address)');
  });
});

describe('discovery runs only when the page is opened or Refresh is pressed', () => {
  it('the page starts a load from exactly two places: opening and Refresh', () => {
    const callSites = page.match(/ run\(\)/g) ?? [];
    expect(callSites).toHaveLength(2);
    expect(page).toContain("if (getLoadedApprovals(addressRef.current) === 'not loaded') run();");
    expect(functionBody(page, 'refresh')).toContain('run();');
  });

  it('opening the page loads through a cancellable zero-delay timer, so a double mount sends one request', () => {
    expect(page).toContain('window.setTimeout(() => {');
    expect(page).toContain('window.clearTimeout(timer)');
  });

  it('the only effect that can start a load depends on nothing but the stable run function', () => {
    const open = page.indexOf('window.setTimeout(() => {');
    expect(open).toBeGreaterThanOrEqual(0);
    const rest = page.slice(open).split('\n');
    const depsLine = rest.find((line) => /^\s{2}\}, \[.*\]\);$/.test(line));
    expect(depsLine).toBe('  }, [run]);');
    // `run` itself has no dependencies, so it cannot change with the account or
    // the token list: it reads both through refs.
    expect(page).toContain('  }, []);\n');
    expect(page).toContain('addressRef.current');
    expect(page).toContain('tokensRef.current');
  });

  it('a failed load is never retried automatically', () => {
    const body = catchBody();
    expect(body).not.toContain('run()');
    expect(body).not.toContain('setTimeout');
  });

  it('a failed load clears what was stored, so only the error is shown', () => {
    const body = catchBody();
    expect(body).toContain('clearLoadedApprovals()');
    expect(body.indexOf('clearLoadedApprovals()')).toBeLessThan(body.indexOf('setError('));
  });

  it('Refresh is disabled while loading and for the cooldown after a press', () => {
    expect(page).toContain('disabled={loading || coolingDown}');
    expect(page).toContain('REFRESH_COOLDOWN_MS');
    expect(functionBody(page, 'refresh')).toContain('setCoolingDown(true)');
  });

  it('nothing outside the Approvals page starts discovery: not startup, not an account switch, not the Security Center', () => {
    const offenders: string[] = [];
    const walk = (dir: URL) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        if (entry.isDirectory()) {
          walk(child);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const text = readFileSync(child, 'utf8');
          if (/(fetchApprovalLogs|loadApprovals)/.test(text)) offenders.push(entry.name);
        }
      }
    };
    walk(new URL('../../../entrypoints/', import.meta.url));
    expect(offenders).toEqual(['ApprovalsPage.tsx']);
  });
});

describe('the loading text follows the request number', () => {
  it('the page shows progressText for the current request while loading, and the verifying text after', () => {
    expect(page).toContain('progressText(progress, MAX_LOG_REQUESTS)');
    expect(page).toContain("progress === 'verifying' ? VERIFYING_TEXT");
    expect(page).toContain('role="status"');
  });

  it('the page updates the number from the load, and ignores updates from an aborted load', () => {
    expect(page).toContain('if (!controller.signal.aborted) setProgress(step);');
    // A load starts at request 1.
    expect(page).toContain("setError('');\n    setProgress(1);");
  });

  it('the text is only shown while a load is running', () => {
    const at = page.indexOf('progressText(progress, MAX_LOG_REQUESTS)');
    const before = page.slice(Math.max(0, at - 200), at);
    expect(before).toContain('{loading && (');
  });
});

describe('the route and the sidebar', () => {
  it('routes #/approvals', () => {
    expect(router).toContain("'approvals'");
    expect(router).toContain("value === '/approvals'");
    expect(app).toContain("route === 'approvals'");
  });

  it('puts "Approvals" between "Address book" and "Security Center"', () => {
    const contacts = sidebar.indexOf("label: 'Address book'");
    const approvals = sidebar.indexOf("label: 'Approvals'");
    const securityCenter = sidebar.indexOf("label: 'Security Center'");
    expect(contacts).toBeGreaterThanOrEqual(0);
    expect(contacts).toBeLessThan(approvals);
    expect(approvals).toBeLessThan(securityCenter);
  });
});

describe('the page offers no way to change an approval', () => {
  it('has no Revoke or Remove button, only the plain sentence', () => {
    expect(page.toLowerCase()).not.toContain('revoke');
    expect(page).toContain('REMOVAL_TEXT');
    const buttons = page.match(/<Button\b/g) ?? [];
    // One button: Refresh.
    expect(buttons).toHaveLength(1);
    expect(page).toContain("{loading ? 'Checking…' : 'Refresh'}");
  });

  it('imports nothing that can sign or send', () => {
    for (const forbidden of ['/send', '/vault', '/unlock', '/confirm', 'submitTransfer', 'openVault']) {
      expect(page).not.toContain(forbidden);
    }
  });

  it('shows the full contract and spender addresses', () => {
    expect(page).toContain('<AddressText value={approval.token} />');
    expect(page).toContain('<AddressText value={approval.spender} />');
  });
});

describe('the Security Center check', () => {
  it('reads the in-memory approvals for the active account and makes no request', () => {
    expect(security).toContain('assessApprovalsForSecurityCenter(getLoadedApprovals(address))');
    expect(security).not.toContain('fetchApprovalLogs');
    expect(security).not.toContain('loadApprovals');
    expect(security).not.toContain('createApprovalClient');
  });
});
