export const RELEASE_FRESH_PRODUCT_CONTROL_IDS = Object.freeze([
  'qa.rule.build',
  'qa.rule.release-archive',
]);

export const RELEASE_INHERITED_AUDIT_CONTROL_IDS = Object.freeze([
  'qa.rule.full-product-coverage',
  'qa.rule.ast-grep',
  'qa.rule.knip',
  'qa.rule.jscpd',
]);

export const RELEASE_INHERITED_EXTRA_CONTROL_IDS = Object.freeze(['qa.rule.production-build']);

const FRESH_PRODUCT_IDS = new Set(RELEASE_FRESH_PRODUCT_CONTROL_IDS);
const INHERITED_AUDIT_IDS = new Set(RELEASE_INHERITED_AUDIT_CONTROL_IDS);

export function releaseProductControlOutcome(controlId) {
  return FRESH_PRODUCT_IDS.has(controlId) ? 'passed' : 'inherited';
}

export function releaseAuditControlOutcome(controlId) {
  return INHERITED_AUDIT_IDS.has(controlId) ? 'inherited' : 'passed';
}
