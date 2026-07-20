import fs from 'node:fs';

const VALID_TARGET_ACTIONS = new Set([
  'keep-baselined',
  'replace-with-repo-rule',
  'remove-after-upstream-fix',
]);

function createBaselineViolation({ baselineRelativePath, line, message }) {
  return {
    rule: 'sonarjs-baseline-invalid',
    file: baselineRelativePath,
    line,
    message,
  };
}

function readBaselineJson(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`required SonarJS baseline is missing: ${baselinePath}`);
  }

  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

function normalizeBaselineEntries(rawBaseline) {
  return rawBaseline?.schemaVersion === 1 && Array.isArray(rawBaseline.entries)
    ? rawBaseline.entries
    : null;
}

function pushBaselineViolation(violations, baselineRelativePath, index, message) {
  violations.push(
    createBaselineViolation({
      baselineRelativePath,
      line: index + 1,
      message: `baseline entry ${index + 1} ${message}`,
    })
  );
}

function requireNonEmptyString(entry, field, context) {
  if (typeof entry[field] === 'string' && entry[field].trim().length > 0) {
    return;
  }

  pushBaselineViolation(
    context.violations,
    context.baselineRelativePath,
    context.index,
    `must define non-empty ${field}`
  );
}

function compileMessagePattern(pattern) {
  return Reflect.construct(RegExp, [pattern, 'u']);
}

function validateMessagePattern(entry, context) {
  if (entry.messagePattern == null) {
    return;
  }

  if (typeof entry.messagePattern !== 'string' || entry.messagePattern.length === 0) {
    pushBaselineViolation(
      context.violations,
      context.baselineRelativePath,
      context.index,
      'messagePattern must be a non-empty regex string'
    );
    return;
  }

  try {
    compileMessagePattern(entry.messagePattern);
  } catch (error) {
    pushBaselineViolation(
      context.violations,
      context.baselineRelativePath,
      context.index,
      `messagePattern is invalid: ${error.message}`
    );
  }
}

function validateClassification(entry, context) {
  if (entry.classification !== 'tool-noise') {
    pushBaselineViolation(
      context.violations,
      context.baselineRelativePath,
      context.index,
      'must use classification "tool-noise"'
    );
  }
}

function validateTargetAction(entry, context) {
  if (!VALID_TARGET_ACTIONS.has(entry.targetAction)) {
    pushBaselineViolation(
      context.violations,
      context.baselineRelativePath,
      context.index,
      'must use a valid targetAction'
    );
  }
}

function validateBaselineEntry(entry, context) {
  for (const field of ['debtId', 'rule', 'file', 'owner', 'reason', 'targetAction']) {
    requireNonEmptyString(entry, field, context);
  }

  validateClassification(entry, context);

  if (typeof entry.rule === 'string' && !context.supportedRuleIds.includes(entry.rule)) {
    pushBaselineViolation(
      context.violations,
      context.baselineRelativePath,
      context.index,
      `uses unsupported SonarJS rule ${entry.rule}`
    );
  }

  if (typeof entry.file === 'string' && !context.isProductionFile(entry.file)) {
    pushBaselineViolation(
      context.violations,
      context.baselineRelativePath,
      context.index,
      'must target a production src JS/TS file'
    );
  }

  if (entry.line != null && (!Number.isInteger(entry.line) || entry.line < 1)) {
    pushBaselineViolation(
      context.violations,
      context.baselineRelativePath,
      context.index,
      'line must be a positive integer when present'
    );
  }

  validateMessagePattern(entry, context);
  validateTargetAction(entry, context);
}

export function loadSonarjsBaseline({
  baselinePath,
  baselineRelativePath,
  isProductionFile,
  supportedRuleIds,
}) {
  const violations = [];
  let rawBaseline;

  try {
    rawBaseline = readBaselineJson(baselinePath);
  } catch (error) {
    return {
      entries: [],
      violations: [
        createBaselineViolation({
          baselineRelativePath,
          message: `baseline JSON could not be parsed: ${error.message}`,
        }),
      ],
    };
  }

  const entries = normalizeBaselineEntries(rawBaseline);
  if (!entries) {
    return {
      entries: [],
      violations: [
        createBaselineViolation({
          baselineRelativePath,
          message: 'baseline must use schemaVersion 1 and an entries array',
        }),
      ],
    };
  }

  for (const [index, entry] of entries.entries()) {
    validateBaselineEntry(entry, {
      baselineRelativePath,
      index,
      isProductionFile,
      supportedRuleIds,
      violations,
    });
  }

  return { entries, violations };
}

function isBaselinedViolation(violation, entry) {
  if (entry.rule !== violation.rule || entry.file !== violation.file) {
    return false;
  }

  if (entry.line != null && entry.line !== violation.line) {
    return false;
  }

  return (
    entry.messagePattern == null ||
    compileMessagePattern(entry.messagePattern).test(violation.message)
  );
}

export function filterSonarjsBaseline(violations, entries) {
  return violations.filter(
    (violation) => !entries.some((entry) => isBaselinedViolation(violation, entry))
  );
}
