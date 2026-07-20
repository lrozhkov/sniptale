import {
  collectFileHeuristicFindings,
  collectReturnedBagFindings,
  compareFindings,
  createFinding,
  elevateCompositeOwnerPressure,
} from './verify-advisory.detectors.helpers.mjs';
import { collectDetachedControllerMethodViolations } from './verify-detached-controller-methods.mjs';
import { collectDetachedThisMethodViolations } from './verify-detached-this-methods.mjs';
import {
  collectCapabilityLossHints,
  collectVisualProofHints,
} from './product-proof-risk-hints.mjs';
import { printAdvisoryReport } from './verify-advisory.report.helpers.mjs';

export { printAdvisoryReport };

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;
const SOURCE_UI_FILE_PATTERN =
  /^src\/(?:content|popup|settings|gallery|design-system|editor|video-editor|scenario-editor|web-snapshot-viewer)\//u;
const EXTENSION_UI_FILE_PATTERN = /^apps\/extension\/src\/[^/]+\//u;
const UI_CONTROLLER_PATTERN = /(?:controller|toolbar|floating|popover|panel|layers|inspector)/u;

function isUiFile(file) {
  return SOURCE_UI_FILE_PATTERN.test(file) || EXTENSION_UI_FILE_PATTERN.test(file);
}

export function collectAdvisoryFindings({ codeFiles = [], targetFiles = [] } = {}) {
  const findings = [
    ...collectWideUiProofFindings({ codeFiles, targetFiles }),
    ...collectVisualProofFindings(codeFiles),
    ...collectCapabilityLossFindings({ codeFiles, targetFiles }),
    ...collectReturnedBagFindings(codeFiles),
    ...collectDetachedControllerMethodFindings(codeFiles),
    ...collectDetachedThisMethodFindings(codeFiles),
    ...codeFiles.flatMap((file) => collectFileHeuristicFindings(file)),
  ];

  return elevateCompositeOwnerPressure(findings).sort(compareFindings);
}

function collectWideUiProofFindings({ codeFiles, targetFiles }) {
  const uiFiles = codeFiles.filter((file) => isUiFile(file) && UI_CONTROLLER_PATTERN.test(file));
  const testCount = targetFiles.filter((file) => TEST_FILE_PATTERN.test(file)).length;
  if (uiFiles.length < 6 || testCount >= Math.max(2, Math.ceil(uiFiles.length / 4))) {
    return [];
  }

  return [
    createFinding({
      family: 'Wide UI diff without proof matrix',
      file: uiFiles[0],
      reason: `${uiFiles.length} UI/controller files changed with ${testCount} changed test file(s).`,
      hint: 'Add or identify a feature -> old behavior -> new surface -> proof matrix.',
      severity: 'attention',
    }),
  ];
}

function collectVisualProofFindings(codeFiles) {
  return collectVisualProofHints({ codeFiles }).map((hint) =>
    createFinding({
      family: 'UI visual proof plan',
      file: codeFiles.find(isUiFile) ?? 'current diff',
      reason: hint,
      hint: 'Capture representative screenshots/states before closeout.',
      severity: 'watch',
    })
  );
}

function collectCapabilityLossFindings({ codeFiles, targetFiles }) {
  return collectCapabilityLossHints({ codeFiles, targetFiles }).map((hint) =>
    createFinding({
      family: 'Capability loss risk',
      file: codeFiles.find((file) => UI_CONTROLLER_PATTERN.test(file)) ?? 'current diff',
      reason: hint,
      hint: 'Use a coverage table where old commands are mapped or intentionally omitted.',
      severity: 'attention',
    })
  );
}

function collectDetachedThisMethodFindings(codeFiles) {
  return collectDetachedThisMethodViolations(codeFiles).map((violation) =>
    createFinding({
      family: 'Detached this-sensitive methods',
      file: violation.file,
      line: violation.line ?? null,
      reason: violation.message,
      hint: 'Wrap this-sensitive methods in closures or bind them before callback handoff.',
      severity: 'attention',
    })
  );
}

function collectDetachedControllerMethodFindings(codeFiles) {
  return collectDetachedControllerMethodViolations(codeFiles, {
    includeAdapterInventory: true,
  }).map((violation) =>
    createFinding({
      family: 'Detached controller methods',
      file: violation.file,
      line: violation.line ?? null,
      reason: violation.message,
      hint:
        violation.rule === 'adapter-controller-method-inventory'
          ? 'Adapter methods are binding-safe today; keep this pass-through intentional.'
          : 'Wrap raw controller methods in closures before crossing callback boundaries.',
      severity: violation.rule === 'adapter-controller-method-inventory' ? 'watch' : 'attention',
    })
  );
}
