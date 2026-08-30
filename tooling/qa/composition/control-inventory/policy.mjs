import fs from 'node:fs';

import { fromRelativePath } from '../../analysis/repository/shared-paths.mjs';

const POLICY_KEYS = ['$comment', 'exceptions', 'schemaVersion'];
const EXCEPTION_KEYS = ['kind', 'path', 'rationale'];
const EXCEPTION_KINDS = new Set(['orphan-executable', 'unsafe-import']);
const COLLECTOR_RELATIONSHIP_PATTERN =
  /\b(?:collect\w*(?:Violations|Errors|Admission)|\w+Errors|inspect\w+Files|project\w*Step\w*)\b/u;

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === 'object' &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function invocationOrigins(executable) {
  return executable.origins.filter(
    (origin) => !origin.startsWith('ast-entry:') && !origin.startsWith('catalog:')
  );
}

function isOrphanExecutable(executable) {
  return (
    executable.controlIds.length === 0 &&
    executable.scriptIds.length === 0 &&
    invocationOrigins(executable).length === 0
  );
}

function needsUnsafeImportException(executable) {
  return executable.importSafety === 'unsafe' && invocationOrigins(executable).length === 0;
}

function parseExceptionPolicy(policy, file) {
  if (
    !exactKeys(policy, POLICY_KEYS) ||
    policy.schemaVersion !== 4 ||
    !Array.isArray(policy.exceptions)
  ) {
    return {
      exceptions: [],
      violations: [
        createViolation(
          'qa-control-policy-schema',
          file,
          'policy requires schemaVersion 4, a comment, and an exceptions array'
        ),
      ],
    };
  }

  const violations = [];
  const identities = new Set();
  for (const [index, entry] of policy.exceptions.entries()) {
    const label = `exception ${index}`;
    if (!exactKeys(entry, EXCEPTION_KEYS)) {
      violations.push(
        createViolation(
          'qa-control-policy-exception-shape',
          file,
          `${label} keys must be exactly kind, path, rationale`
        )
      );
      continue;
    }
    if (!EXCEPTION_KINDS.has(entry.kind)) {
      violations.push(
        createViolation(
          'qa-control-policy-exception-kind',
          file,
          `${label} has unsupported kind ${String(entry.kind)}`
        )
      );
    }
    for (const key of EXCEPTION_KEYS) {
      if (typeof entry[key] !== 'string' || entry[key].trim() === '') {
        violations.push(
          createViolation(
            'qa-control-policy-exception-metadata',
            file,
            `${label} requires non-empty ${key}`
          )
        );
      }
    }
    const identity = `${entry.kind}:${entry.path}`;
    if (identities.has(identity)) {
      violations.push(
        createViolation('qa-control-policy-exception-duplicate', file, `duplicate ${identity}`)
      );
    }
    identities.add(identity);
  }
  return { exceptions: policy.exceptions, violations };
}

function collectCatalogClosureViolations(discovery) {
  const executableByPath = new Map(discovery.executables.map((entry) => [entry.path, entry]));
  const violations = [];
  for (const control of discovery.controls) {
    if (!control.source.startsWith('tooling/')) continue;
    if (control.sourceExists !== true) {
      violations.push(
        createViolation(
          'qa-control-source-missing',
          control.source,
          `${control.id} source is missing`
        )
      );
      continue;
    }
    const executable = executableByPath.get(control.source);
    if (executable && !executable.controlIds.includes(control.id)) {
      violations.push(
        createViolation(
          'qa-control-source-closure',
          control.source,
          `${control.id} is not linked back from exact executable discovery`
        )
      );
    }
  }
  return violations;
}

function collectSemanticRelationshipViolations(discovery, readSource) {
  const violations = [];
  for (const control of discovery.controls.filter(({ semanticClass }) =>
    semanticClass.includes('semantic')
  )) {
    if (control.proofFiles.length === 0) {
      violations.push(
        createViolation(
          'qa-semantic-control-missing-fixture',
          control.source,
          `${control.id} needs an explicit fixture declaration`
        )
      );
    }
    if (!control.source.startsWith('tooling/') || control.sourceExists !== true) continue;
    const source = readSource(control.source);
    if (!COLLECTOR_RELATIONSHIP_PATTERN.test(source)) {
      violations.push(
        createViolation(
          'qa-semantic-control-missing-collector',
          control.source,
          `${control.id} must expose its semantic collector without requiring a runner or CLI`
        )
      );
    }
  }
  return violations;
}

function collectExecutableViolations(discovery, exceptions, file) {
  const byIdentity = new Map(exceptions.map((entry) => [`${entry.kind}:${entry.path}`, entry]));
  const violations = [];
  for (const executable of discovery.executables) {
    if (['malformed', 'mixed'].includes(executable.entrypointKind)) {
      violations.push(
        createViolation(
          'qa-executable-import-safety',
          executable.path,
          `executable entrypoint is ${executable.entrypointKind} and cannot be imported safely`
        )
      );
    }
    if (isOrphanExecutable(executable) && !byIdentity.has(`orphan-executable:${executable.path}`)) {
      violations.push(
        createViolation(
          'qa-executable-orphan',
          executable.path,
          'executable has no wrapper, package, workflow, internal process, catalog, or operator relationship'
        )
      );
    }
    if (
      needsUnsafeImportException(executable) &&
      !byIdentity.has(`unsafe-import:${executable.path}`)
    ) {
      violations.push(
        createViolation(
          'qa-executable-import-safety',
          executable.path,
          'import-unsafe executable has no exact process consumer relationship'
        )
      );
    }
  }

  const executableByPath = new Map(discovery.executables.map((entry) => [entry.path, entry]));
  for (const exception of exceptions) {
    const executable = executableByPath.get(exception.path);
    const stillNeeded =
      exception.kind === 'orphan-executable'
        ? executable && isOrphanExecutable(executable)
        : executable && needsUnsafeImportException(executable);
    if (!stillNeeded) {
      violations.push(
        createViolation(
          'qa-control-policy-exception-stale',
          file,
          `${exception.kind}:${exception.path} no longer suppresses a current derived violation`
        )
      );
    }
  }
  return violations;
}

function collectPolicyConsumerViolations(discovery) {
  return discovery.policyFiles
    .filter(({ consumers }) => consumers.length === 0)
    .map(({ path }) =>
      createViolation(
        'qa-policy-file-no-consumer',
        path,
        'policy has no discovered production consumer; remove it or add the real consumer'
      )
    );
}

export function collectControlPolicyViolations(
  discovery,
  policy,
  {
    file = 'tooling/configs/qa/control-dispositions.data.json',
    readSource = (source) => fs.readFileSync(fromRelativePath(source), 'utf8'),
  } = {}
) {
  const parsed = parseExceptionPolicy(policy, file);
  if (parsed.violations.length > 0) return parsed.violations;
  return [
    ...collectCatalogClosureViolations(discovery),
    ...collectSemanticRelationshipViolations(discovery, readSource),
    ...collectExecutableViolations(discovery, parsed.exceptions, file),
    ...collectPolicyConsumerViolations(discovery),
  ];
}
