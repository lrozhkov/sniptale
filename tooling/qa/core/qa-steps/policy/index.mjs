import { resolveQaDomainPolicy } from './domain.mjs';
import { resolveQaLanePolicy } from './lane.mjs';
import { resolveQaToolSource } from './source.mjs';

const SKIP_REASON_BY_EXECUTION = {
  advisory: 'no-applicable-targets',
  always: 'no-applicable-targets',
  conditional: 'trigger-not-matched',
  manual: 'operator-not-invoked',
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function resolveEngine(kind) {
  if (kind === 'guardrail') return 'repo-policy';
  if (kind === 'manual' || kind === 'advisory') return 'analysis';
  return 'tooling-runtime';
}

function createSkipPolicy(execution) {
  return Object.freeze({
    allowedReason: SKIP_REASON_BY_EXECUTION[execution],
    mustReport: true,
  });
}

export function createQaStepOccurrence({ id, label, tool, source, runsIn, lane, kind, execution }) {
  const lanePolicy = resolveQaLanePolicy(lane);
  const executionMode = execution ?? lanePolicy.execution;
  return Object.freeze({
    id: `qa.rule.${id ?? slugify(label)}`,
    toolId: `qa.tool.${slugify(tool)}`,
    label,
    kind,
    engine: resolveEngine(kind),
    tool,
    source: source ?? resolveQaToolSource(tool),
    lane,
    runsIn: runsIn ?? lanePolicy.runsIn,
    requiredBy: lanePolicy.requiredBy,
    execution: executionMode,
    skipPolicy: createSkipPolicy(executionMode),
    status: kind === 'manual' || kind === 'advisory' ? 'advisory' : 'blocking',
    ...resolveQaDomainPolicy(label),
  });
}
