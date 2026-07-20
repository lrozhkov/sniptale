export const AUDIT_ADAPTER_SKIP_REASONS = Object.freeze({
  toolUnavailable: 'audit.tool-unavailable',
  bootstrapFailed: 'audit.bootstrap-failed',
  noApplicableTargets: 'audit.no-applicable-targets',
});

export const AUDIT_PROFILE_SKIP_REASONS = Object.freeze({
  profileNotSelected: 'audit.profile-not-selected',
  optionalEngineUnavailable: 'audit.optional-engine-unavailable',
  optionalEngineBootstrapFailed: 'audit.optional-engine-bootstrap-failed',
  optionalNoApplicableTargets: 'audit.optional-no-applicable-targets',
});

const optionalSkipReasonByAdapterReason = Object.freeze({
  [AUDIT_ADAPTER_SKIP_REASONS.toolUnavailable]:
    AUDIT_PROFILE_SKIP_REASONS.optionalEngineUnavailable,
  [AUDIT_ADAPTER_SKIP_REASONS.bootstrapFailed]:
    AUDIT_PROFILE_SKIP_REASONS.optionalEngineBootstrapFailed,
  [AUDIT_ADAPTER_SKIP_REASONS.noApplicableTargets]:
    AUDIT_PROFILE_SKIP_REASONS.optionalNoApplicableTargets,
});

export function resolveOptionalAuditSkipReason(adapterReasonId) {
  return optionalSkipReasonByAdapterReason[adapterReasonId] ?? null;
}
