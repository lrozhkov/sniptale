export function formatFocusedScopeDecision(scope, decision) {
  const { counts, reasons, verdict } = scope;
  const reasonDetail = reasons.length > 0 ? reasons.join(',') : 'none';

  return [
    `decision=${decision}`,
    `verdict=${verdict}`,
    `reasons=${reasonDetail}`,
    `tests=${counts.tests}`,
    `coverageTargets=${counts.coverageTargets}`,
    `ownerTests=${counts.ownerTests}`,
  ].join('; ');
}
