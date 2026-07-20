import { expect, it, vi } from 'vitest';

import { createAuditProgressReporter, formatAuditProgress } from './audit-progress.mjs';

it('writes every audit phase transition to the durable run log', () => {
  const writeLog = vi.fn();
  const writeTerminal = vi.fn();
  const report = createAuditProgressReporter({
    session: { writeLog },
    writeTerminal,
  });

  report({ controlId: 'semgrep', label: 'Semgrep', state: 'started' });
  report({
    controlId: 'semgrep',
    label: 'Semgrep',
    state: 'completed',
    outcome: 'ok',
    durationMs: 17.6,
  });

  expect(writeLog).toHaveBeenCalledTimes(2);
  expect(writeLog.mock.calls[0][0]).toContain('control=semgrep');
  expect(writeLog.mock.calls[1][0]).toContain('outcome=ok durationMs=18');
  expect(writeTerminal).not.toHaveBeenCalled();
});

it('also exposes long-running phase transitions in terminal output', () => {
  const writeLog = vi.fn();
  const writeTerminal = vi.fn();
  const report = createAuditProgressReporter({
    session: { writeLog },
    writeTerminal,
  });

  report({ controlId: 'codeql', label: 'CodeQL', state: 'started' });

  expect(writeLog).toHaveBeenCalledTimes(1);
  expect(writeTerminal).toHaveBeenCalledWith(
    '[qa.audit.progress] control=codeql label="CodeQL" state=started\n'
  );
});

it('formats progress as one stable machine-readable line', () => {
  expect(
    formatAuditProgress({
      controlId: 'full-product-coverage',
      label: 'Full product coverage',
      state: 'completed',
      outcome: 'failed',
      durationMs: 1000,
    })
  ).toBe(
    [
      '[qa.audit.progress] control=full-product-coverage',
      'label="Full product coverage" state=completed outcome=failed durationMs=1000',
    ].join(' ')
  );
});
