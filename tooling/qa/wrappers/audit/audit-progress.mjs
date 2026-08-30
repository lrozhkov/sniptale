const TERMINAL_PROGRESS_CONTROLS = new Set(['codeql', 'full-product-coverage']);

function formatDuration(durationMs) {
  return Number.isFinite(durationMs) ? ` durationMs=${Math.max(0, Math.round(durationMs))}` : '';
}

export function formatAuditProgress({ controlId, label, state, outcome, durationMs }) {
  return [
    `[qa.audit.progress] control=${controlId}`,
    `label=${JSON.stringify(label)}`,
    `state=${state}`,
    outcome ? `outcome=${outcome}` : '',
    formatDuration(durationMs).trim(),
  ]
    .filter(Boolean)
    .join(' ');
}

export function createAuditProgressReporter({
  session,
  writeTerminal = (value) => process.stdout.write(value),
} = {}) {
  return (event) => {
    recordTimelineTransition({
      activityId: `audit-control.${event.controlId}`,
      kind: 'audit-control',
      state: event.state,
      reused: event.reused ?? false,
      executionProfile: {
        cpuTokens: 1,
        memoryMiB: null,
        workers: 1,
        pid: process.pid,
        workerId: `process-${process.pid}`,
      },
    });
    const line = `${formatAuditProgress(event)}\n`;
    session.writeLog(line);
    if (TERMINAL_PROGRESS_CONTROLS.has(event.controlId)) writeTerminal(line);
  };
}
import { recordTimelineTransition } from '../../runtime/observability/timeline-context.mjs';
