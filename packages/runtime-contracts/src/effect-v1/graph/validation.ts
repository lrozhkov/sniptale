import {
  COMMAND_KEYS,
  commandNeedsChildren,
  EFFECT_V1_GRAPH_LIMITS,
  GRAPH_OPS,
  isLoopCommand,
} from './command.js';
import {
  createEffectV1ReadReferences,
  type EffectV1GraphReferences,
  type EffectV1ReadReferences,
} from './model.js';
import {
  validateCommandExpressions,
  validateEffectV1Definitions,
} from '../expression/validation.js';
import {
  collectEffectV1PassIndex,
  type EffectV1PassIndex,
  validateEffectV1CommandSemantics,
} from '../command/validation.js';
import { validateRequiredRuntimeInputs } from './runtime-inputs.js';
import { validateCommandReferences } from './references.js';
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  rejectUnknownKeys,
  requireIdentifier,
} from '../validation/shared.js';

export { EXPRESSION_OPS } from '../expression/validation.js';
export { GRAPH_OPS } from './command.js';
export type { EffectV1GraphReferences } from './model.js';

export function validateEffectV1Graph(
  program: EffectV1Record,
  assets: Map<string, EffectV1Record>,
  runtimeInputs: Set<string>,
  references: EffectV1GraphReferences,
  report: EffectV1DiagnosticReporter
): void {
  const definitions = isRecord(program['definitions']) ? program['definitions'] : {};
  const readReferences = createEffectV1ReadReferences(definitions, runtimeInputs, references);
  if (program['definitions'] !== undefined && !isRecord(program['definitions'])) {
    report.error(
      'DEFINITIONS_TYPE',
      '$.program.definitions',
      'Expected a named expression object.'
    );
  }
  validateEffectV1Definitions(definitions, readReferences, report);
  if (!Array.isArray(program['commands'])) {
    report.error('COMMANDS_TYPE', '$.program.commands', 'Expected a command array.');
    return;
  }
  if (program['commands'].length === 0) {
    report.error(
      'COMMANDS_EMPTY',
      '$.program.commands',
      'A graph program needs at least one render command.'
    );
    return;
  }
  const passes = collectEffectV1PassIndex(program['commands']);
  validateCommands(
    program['commands'],
    '$.program.commands',
    0,
    assets,
    runtimeInputs,
    { expanded: 0, nodes: 0 },
    report,
    readReferences,
    passes
  );
  validateRequiredRuntimeInputs(program['commands'], runtimeInputs, report);
}

function validateCommands(
  commands: unknown[],
  path: string,
  depth: number,
  assets: Map<string, EffectV1Record>,
  runtimeInputs: Set<string>,
  budget: { expanded: number; nodes: number },
  report: EffectV1DiagnosticReporter,
  references: EffectV1ReadReferences,
  passes: EffectV1PassIndex,
  multiplier = 1
): void {
  if (depth > EFFECT_V1_GRAPH_LIMITS.graphDepth) {
    report.error(
      'GRAPH_DEPTH',
      path,
      `Graph nesting exceeds ${EFFECT_V1_GRAPH_LIMITS.graphDepth}.`
    );
    return;
  }
  for (let index = 0; index < commands.length; index += 1) {
    const keepGoing = validateCommand(
      commands[index],
      `${path}[${index}]`,
      path,
      depth,
      assets,
      runtimeInputs,
      budget,
      report,
      references,
      passes,
      multiplier
    );
    if (!keepGoing) return;
  }
}

function validateCommand(
  command: unknown,
  commandPath: string,
  parentPath: string,
  depth: number,
  assets: Map<string, EffectV1Record>,
  runtimeInputs: Set<string>,
  budget: { expanded: number; nodes: number },
  report: EffectV1DiagnosticReporter,
  references: EffectV1ReadReferences,
  passes: EffectV1PassIndex,
  multiplier: number
): boolean {
  if (!consumeGraphBudget(budget, multiplier, parentPath, report)) return false;
  if (!isRecord(command) || !GRAPH_OPS.has(String(command['op']))) {
    report.error(
      'COMMAND_OP',
      `${commandPath}.op`,
      `Unknown render command "${isRecord(command) ? String(command['op']) : String(command)}".`
    );
    return true;
  }
  const operation = String(command['op']);
  rejectUnknownKeys(command, COMMAND_KEYS[operation]!, commandPath, report);
  validateEffectV1CommandSemantics(command, commandPath, passes, report);
  validateCommandExpressions(command, commandPath, report, references);
  validateCommandReferences(command, commandPath, assets, runtimeInputs, references, report);
  if (command['op'] === 'renderPass') {
    requireIdentifier(command['id'], `${commandPath}.id`, report);
  }
  if (command['op'] === 'compositePass') {
    requireIdentifier(command['passId'], `${commandPath}.passId`, report);
  }
  validateCommandChildren(
    command,
    operation,
    commandPath,
    depth,
    assets,
    runtimeInputs,
    budget,
    report,
    references,
    passes,
    multiplier
  );
  return true;
}

function validateCommandChildren(
  command: EffectV1Record,
  operation: string,
  path: string,
  depth: number,
  assets: Map<string, EffectV1Record>,
  runtimeInputs: Set<string>,
  budget: { expanded: number; nodes: number },
  report: EffectV1DiagnosticReporter,
  references: EffectV1ReadReferences,
  passes: EffectV1PassIndex,
  multiplier: number
): void {
  if (!commandNeedsChildren(operation)) return;
  if (!Array.isArray(command['commands'])) {
    report.error('CHILD_COMMANDS_TYPE', `${path}.commands`, 'Expected a command array.');
    return;
  }
  const loopMultiplier = isLoopCommand(operation)
    ? Math.max(1, resolveLoopBound(command, path, report))
    : 1;
  validateCommands(
    command['commands'],
    `${path}.commands`,
    depth + 1,
    assets,
    runtimeInputs,
    budget,
    report,
    references,
    passes,
    multiplier * loopMultiplier
  );
}

function consumeGraphBudget(
  budget: { expanded: number; nodes: number },
  multiplier: number,
  path: string,
  report: EffectV1DiagnosticReporter
): boolean {
  budget.nodes += 1;
  budget.expanded += multiplier;
  if (budget.nodes > EFFECT_V1_GRAPH_LIMITS.graphNodes) {
    report.error(
      'GRAPH_NODE_BUDGET',
      path,
      `Graph exceeds ${EFFECT_V1_GRAPH_LIMITS.graphNodes} nodes.`
    );
    return false;
  }
  if (budget.expanded > EFFECT_V1_GRAPH_LIMITS.expandedCommands) {
    report.error(
      'GRAPH_EXPANSION_BUDGET',
      path,
      `Worst-case execution exceeds ${EFFECT_V1_GRAPH_LIMITS.expandedCommands} commands per frame.`
    );
    return false;
  }
  return true;
}

function resolveLoopBound(
  command: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): number {
  const count =
    command['op'] === 'forEach' || command['op'] === 'stableOrderBy'
      ? Array.isArray(command['items'])
        ? command['items'].length
        : Number.NaN
      : command['op'] === 'forGrid'
        ? Number(command['columns']) * Number(command['rows'])
        : Number(command['count']);
  if (!Number.isSafeInteger(count) || count < 0 || count > EFFECT_V1_GRAPH_LIMITS.loopIterations) {
    report.error(
      'LOOP_BOUND',
      path,
      `Loop bound must be a static integer from 0 to ${EFFECT_V1_GRAPH_LIMITS.loopIterations}.`,
      'Use a bounded constant list/count; runtime-dependent loop lengths are forbidden.'
    );
    return EFFECT_V1_GRAPH_LIMITS.loopIterations;
  }
  return count;
}
