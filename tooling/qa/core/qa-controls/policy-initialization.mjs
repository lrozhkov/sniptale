const ADAPTED_POLICY_PATTERN =
  /baseline|validation-manifest|audit-profiles|technical-debt|dependency-policy/u;

function controlPolicyRows(controls) {
  const nonManualByTool = new Map(
    controls.filter(({ kind }) => kind !== 'manual').map((control) => [control.tool, control.id])
  );
  return controls.map((control) => {
    const successor = control.kind === 'manual' ? nonManualByTool.get(control.tool) : null;
    const disposition = successor ? 'replace' : control.lanes.includes('audit') ? 'adapt' : 'keep';
    const rationale = successor
      ? 'A report-only occurrence reuses the canonical executable control identity.'
      : control.lanes.includes('audit')
        ? 'Audit profile requiredness and structured skip semantics use the canonical audit-profile authority.'
        : 'The control remains a permanent repository rule with canonical lane ownership.';
    return {
      id: control.id,
      disposition,
      owner: control.owner,
      rationale,
      sourceKind: control.source.startsWith('tooling/') ? 'repository' : 'external',
      ...(successor ? { successorId: successor } : {}),
      ...(control.proofFiles.length === 0
        ? {
            proofReason:
              'Execution is proved transitively by its canonical wrapper or external integration lane.',
          }
        : {}),
    };
  });
}

function policyFileRows(policyFiles) {
  return policyFiles.map(({ consumers, path }) => ({
    path,
    consumers,
    disposition: ADAPTED_POLICY_PATTERN.test(path.split('/').at(-1)) ? 'adapt' : 'keep',
    owner: 'qa-platform',
    rationale: ADAPTED_POLICY_PATTERN.test(path.split('/').at(-1))
      ? 'This policy is validated through the canonical control, debt, or audit-profile authority.'
      : 'This remains a narrow permanent repository policy with a discovered consumer.',
  }));
}

function executableRows(executables, controls) {
  const dispositionById = new Map(controls.map((row) => [row.id, row.disposition]));
  return executables.map((executable) => {
    const adapted = executable.controlIds.some((id) => dispositionById.get(id) === 'adapt');
    const orphan =
      executable.proofFiles.length === 0 &&
      executable.controlIds.length === 0 &&
      executable.scriptIds.length === 0;
    return {
      path: executable.path,
      disposition: adapted ? 'adapt' : 'keep',
      owner: 'qa-platform',
      rationale:
        executable.controlIds.length > 0
          ? 'Executable behavior is owned by its canonical control identity.'
          : 'This is a permanent QA orchestration or diagnostic entrypoint.',
      ...(orphan
        ? {
            proofReason:
              'Internal orchestration entrypoint is exercised transitively by release-harness.',
          }
        : {}),
    };
  });
}

function stableRows(values, key, rationale) {
  return values.map((value) => ({
    [key]: typeof value === 'string' ? value : value[key],
    disposition: 'keep',
    owner: 'qa-platform',
    rationale,
  }));
}

export function createInitialControlPolicy(discovery) {
  const controls = controlPolicyRows(discovery.controls);
  return {
    schemaVersion: 1,
    controls,
    executables: executableRows(discovery.executables, controls),
    policyFiles: policyFileRows(discovery.policyFiles),
    scripts: stableRows(
      discovery.packageQaScripts,
      'id',
      'The package script is a supported canonical QA operator entrypoint.'
    ),
    validationTools: stableRows(
      discovery.validationTools,
      'tool',
      'The validation row proves a deterministic repository tool or canonical control.'
    ),
  };
}
