import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isEditorVectorDefinition,
  isEditorVectorInstance,
  type EditorVectorDefinition,
} from './vector-element';

/** Check instance references without resolving or rendering SVG resources. */
export function inspectEditorVectorCanvas(canvas: unknown, definitionIds: ReadonlySet<string>) {
  const referenced = new Set<string>();
  const pending = [{ value: canvas, depth: 0, clip: false }];
  let nodes = 0;
  while (pending.length) {
    const next = pending.pop()!;
    if (++nodes > 20000 || next.depth > 40)
      return {
        valid: false,
        hasVectors: referenced.size > 0,
        referencedDefinitionIds: [...referenced],
      };
    if (!isRecord(next.value)) continue;
    const value = next.value;
    const instance = value['sniptaleVectorElement'];
    if (instance !== undefined || value['sniptaleType'] === 'vector-element') {
      if (
        next.clip ||
        value['sniptaleType'] !== 'vector-element' ||
        typeof value['type'] !== 'string' ||
        value['type'].toLowerCase() !== 'group' ||
        !isEditorVectorInstance(instance) ||
        !definitionIds.has(instance.definitionId) ||
        (value['objects'] !== undefined &&
          (!Array.isArray(value['objects']) || value['objects'].length !== 0))
      )
        return { valid: false, hasVectors: true, referencedDefinitionIds: [...referenced] };
      referenced.add(instance.definitionId);
    }
    const objects = value['objects'];
    if (Array.isArray(objects))
      for (const child of objects)
        pending.push({ value: child, depth: next.depth + 1, clip: next.clip });
    if (value['clipPath'] !== undefined)
      pending.push({ value: value['clipPath'], depth: next.depth + 1, clip: true });
  }
  return {
    valid: referenced.size === definitionIds.size,
    hasVectors: referenced.size > 0,
    referencedDefinitionIds: [...referenced],
  };
}

/** Validate logical definitions and overrides; projection must additionally admit the SVG profile. */
export function isEditorVectorDocumentData(
  canvasJson: string,
  version: unknown,
  definitions: unknown
): boolean {
  if (definitions !== undefined && (!isRecord(definitions) || version !== 4)) return false;
  const entries = isRecord(definitions) ? Object.entries(definitions) : [];
  if (entries.length > 20000) return false;
  const admitted = new Map<string, EditorVectorDefinition>();
  for (const [id, definition] of entries) {
    if (!isEditorVectorDefinition(definition) || definition.id !== id) return false;
    admitted.set(id, definition);
  }
  try {
    const canvas: unknown = JSON.parse(canvasJson);
    const inspected = inspectEditorVectorCanvas(canvas, new Set(admitted.keys()));
    if (!inspected.valid || (version !== 4 && inspected.hasVectors)) return false;
    const pending: unknown[] = [canvas];
    while (pending.length) {
      const value = pending.pop();
      if (!isRecord(value)) continue;
      const instance = value['sniptaleVectorElement'];
      if (isEditorVectorInstance(instance)) {
        const definition = admitted.get(instance.definitionId);
        if (
          !definition ||
          (!definition.capabilities.strokeScale && instance.overrides.strokeScale !== 1) ||
          Object.keys(instance.overrides.colors).some(
            (id) => !definition.slots.some((slot) => slot.id === id)
          )
        )
          return false;
      }
      const objects = value['objects'];
      if (Array.isArray(objects)) {
        const children: unknown[] = objects;
        for (const child of children) pending.push(child);
      }
    }
    return true;
  } catch {
    return false;
  }
}
