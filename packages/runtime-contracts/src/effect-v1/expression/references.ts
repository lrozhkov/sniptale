import type { EffectV1ReadReferences } from '../graph/model.js';
import type { EffectV1DiagnosticReporter } from '../validation/shared.js';

export function validateReadReference(
  value: unknown,
  path: string,
  references: EffectV1ReadReferences,
  report: EffectV1DiagnosticReporter
): void {
  if (typeof value !== 'string') return;
  const reference = resolveDeclaredReference(value, references);
  if (!reference || reference.ids.has(reference.id)) return;
  report.error(
    'READ_REFERENCE_UNKNOWN',
    path,
    `Unknown ${reference.kind} "${reference.id}".`,
    `Declare the ${reference.kind} or correct the read path.`
  );
}

function resolveDeclaredReference(
  path: string,
  references: EffectV1ReadReferences
): { id: string; ids: Set<string>; kind: string } | null {
  if (path.startsWith('controls.')) {
    return { id: path.slice(9), ids: references.controlIds, kind: 'control' };
  }
  if (path.startsWith('tracks.')) {
    return { id: path.slice(7), ids: references.trackIds, kind: 'track' };
  }
  if (path.startsWith('defs.')) {
    return { id: path.slice(5), ids: references.definitionIds, kind: 'definition' };
  }
  if (path.startsWith('input.')) {
    return { id: path.slice(6), ids: references.runtimeInputs, kind: 'runtime input' };
  }
  if (path.startsWith('layers.')) {
    return {
      id: path.slice(7).split('.')[0] ?? '',
      ids: references.layerIds,
      kind: 'layer',
    };
  }
  return null;
}
