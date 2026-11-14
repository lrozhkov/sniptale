/** Immutable, self-contained artwork retained by the document resource closure. */
export interface EditorVectorDefinition {
  version: 1;
  id: string;
  viewBox: { minX: number; minY: number; width: number; height: number };
  svg: string;
  slots: EditorVectorSlot[];
  capabilities: { palette: boolean; strokeScale: boolean };
  provenance: EditorVectorProvenance;
}

/** Attribution is descriptive metadata. URLs never authorize a resource request. */
export interface EditorVectorProvenance {
  sourceId: string | null;
  prefix: string | null;
  name: string | null;
  author: string | null;
  authorUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
}

export interface EditorVectorSlot {
  id: string;
  kind: 'current-color' | 'explicit-color';
  originalColor: string;
  bindings: { nodeId: string; attribute: 'fill' | 'stroke' }[];
}

/** Per-instance styling; ordinary object transforms remain on the document object. */
export interface EditorVectorInstance {
  version: 1;
  definitionId: string;
  overrides: { colors: Record<string, string>; strokeScale: number };
}

const DIGEST = /^[a-f0-9]{64}$/u;
const NODE_ID = /^v\d+$/u;
const SLOT_ID = /^c\d+$/u;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

/** Only concrete canonical colors cross the instance boundary. */
export function isEditorVectorColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.length === 7 || value.length === 9) &&
    /^#[a-f0-9]+$/u.test(value)
  );
}

function isProvenanceEntry(entry: unknown): boolean {
  if (entry === null) return true;
  if (typeof entry !== 'string' || entry.length > 2048) return false;
  for (let index = 0; index < entry.length; index++) {
    if (entry.charCodeAt(index) < 32) return false;
  }
  return true;
}

export function isEditorVectorProvenance(value: unknown): value is EditorVectorProvenance {
  return (
    record(value) &&
    keys(value, ['sourceId', 'prefix', 'name', 'author', 'authorUrl', 'license', 'licenseUrl']) &&
    Object.values(value).every(isProvenanceEntry)
  );
}

function isSlot(value: unknown): value is EditorVectorSlot {
  return (
    record(value) &&
    keys(value, ['id', 'kind', 'originalColor', 'bindings']) &&
    typeof value['id'] === 'string' &&
    SLOT_ID.test(value['id']) &&
    (value['kind'] === 'current-color' || value['kind'] === 'explicit-color') &&
    isEditorVectorColor(value['originalColor']) &&
    Array.isArray(value['bindings']) &&
    value['bindings'].length > 0 &&
    value['bindings'].length <= 1000 &&
    value['bindings'].every(
      (binding: unknown) =>
        record(binding) &&
        keys(binding, ['nodeId', 'attribute']) &&
        typeof binding['nodeId'] === 'string' &&
        NODE_ID.test(binding['nodeId']) &&
        (binding['attribute'] === 'fill' || binding['attribute'] === 'stroke')
    )
  );
}

/** Structural admission only. The SVG owner must also verify the profile and digest before use. */
export function isEditorVectorDefinition(value: unknown): value is EditorVectorDefinition {
  if (
    !record(value) ||
    !keys(value, ['version', 'id', 'viewBox', 'svg', 'slots', 'capabilities', 'provenance'])
  )
    return false;
  const box = value['viewBox'];
  const capabilities = value['capabilities'];
  return (
    value['version'] === 1 &&
    typeof value['id'] === 'string' &&
    DIGEST.test(value['id']) &&
    record(box) &&
    keys(box, ['minX', 'minY', 'width', 'height']) &&
    Object.values(box).every(
      (entry) => typeof entry === 'number' && Number.isFinite(entry) && Math.abs(entry) <= 131072
    ) &&
    typeof box['width'] === 'number' &&
    box['width'] > 0 &&
    typeof box['height'] === 'number' &&
    box['height'] > 0 &&
    typeof value['svg'] === 'string' &&
    value['svg'].length <= 2097152 &&
    Array.isArray(value['slots']) &&
    value['slots'].length <= 1000 &&
    value['slots'].every(isSlot) &&
    new Set(value['slots'].map((slot) => slot.id)).size === value['slots'].length &&
    record(capabilities) &&
    keys(capabilities, ['palette', 'strokeScale']) &&
    typeof capabilities['palette'] === 'boolean' &&
    typeof capabilities['strokeScale'] === 'boolean' &&
    isEditorVectorProvenance(value['provenance'])
  );
}

export function isEditorVectorInstance(value: unknown): value is EditorVectorInstance {
  if (!record(value) || !keys(value, ['version', 'definitionId', 'overrides'])) return false;
  const overrides = value['overrides'];
  return (
    value['version'] === 1 &&
    typeof value['definitionId'] === 'string' &&
    DIGEST.test(value['definitionId']) &&
    record(overrides) &&
    keys(overrides, ['colors', 'strokeScale']) &&
    record(overrides['colors']) &&
    Object.keys(overrides['colors']).length <= 1000 &&
    Object.entries(overrides['colors']).every(
      ([key, color]) => SLOT_ID.test(key) && isEditorVectorColor(color)
    ) &&
    typeof overrides['strokeScale'] === 'number' &&
    Number.isFinite(overrides['strokeScale']) &&
    overrides['strokeScale'] >= 0.01 &&
    overrides['strokeScale'] <= 100
  );
}

export function createEditorVectorInstance(definitionId: string): EditorVectorInstance {
  if (!DIGEST.test(definitionId)) throw new Error('Invalid vector definition identity.');
  return { version: 1, definitionId, overrides: { colors: {}, strokeScale: 1 } };
}

/** Stable JSON for portable definition resources, independent of object key insertion order. */
export function serializeEditorVectorDefinition(definition: EditorVectorDefinition): string {
  const { viewBox, provenance, capabilities } = definition;
  return JSON.stringify({
    version: 1,
    id: definition.id,
    viewBox: {
      minX: viewBox.minX,
      minY: viewBox.minY,
      width: viewBox.width,
      height: viewBox.height,
    },
    svg: definition.svg,
    slots: definition.slots.map((slot) => ({
      id: slot.id,
      kind: slot.kind,
      originalColor: slot.originalColor,
      bindings: slot.bindings.map((binding) => ({
        nodeId: binding.nodeId,
        attribute: binding.attribute,
      })),
    })),
    capabilities: { palette: capabilities.palette, strokeScale: capabilities.strokeScale },
    provenance: {
      sourceId: provenance.sourceId,
      prefix: provenance.prefix,
      name: provenance.name,
      author: provenance.author,
      authorUrl: provenance.authorUrl,
      license: provenance.license,
      licenseUrl: provenance.licenseUrl,
    },
  });
}

/** Content identity excludes its own digest and all library receipt timestamps. */
export async function computeEditorVectorDefinitionDigest(
  definition: Omit<EditorVectorDefinition, 'id'>
): Promise<string> {
  const serialized = serializeEditorVectorDefinition({ ...definition, id: '' });
  const bytes = new TextEncoder().encode(serialized);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

/** Digest proof is independent of SVG profile proof, which the renderer must also perform. */
export async function validateEditorVectorDefinitionDigest(value: unknown): Promise<boolean> {
  return (
    isEditorVectorDefinition(value) &&
    value.id === (await computeEditorVectorDefinitionDigest(value))
  );
}
