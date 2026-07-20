import { type EffectV1DiagnosticReporter, isRecord } from '../validation/shared.js';

export function validateDefinitionCycles(
  definitions: Record<string, unknown>,
  report: EffectV1DiagnosticReporter
): void {
  const refs = new Map<string, Set<string>>();
  for (const [name, expression] of Object.entries(definitions)) {
    const target = new Set<string>();
    collectDefinitionRefs(expression, target);
    refs.set(name, target);
  }
  for (const name of refs.keys()) {
    if (hasCycle(name, refs, new Set(), new Set())) {
      report.error(
        'DEFINITION_CYCLE',
        `$.program.definitions.${name}`,
        'Named expressions must be acyclic.'
      );
    }
  }
}

function collectDefinitionRefs(value: unknown, refs: Set<string>): void {
  if (!isRecord(value)) return;
  if (
    value['op'] === 'read' &&
    typeof value['path'] === 'string' &&
    value['path'].startsWith('defs.')
  ) {
    refs.add(value['path'].slice(5));
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => collectDefinitionRefs(item, refs));
    else collectDefinitionRefs(child, refs);
  }
}

function hasCycle(
  name: string,
  refs: Map<string, Set<string>>,
  visiting: Set<string>,
  visited: Set<string>
): boolean {
  if (visiting.has(name)) return true;
  if (visited.has(name)) return false;
  visiting.add(name);
  for (const dependency of refs.get(name) ?? []) {
    if (refs.has(dependency) && hasCycle(dependency, refs, visiting, visited)) return true;
  }
  visiting.delete(name);
  visited.add(name);
  return false;
}
