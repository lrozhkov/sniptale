import { z } from 'zod';
import { parseColor } from '@sniptale/foundation/color';
import type {
  ControlDefinition,
  EffectControlSet,
} from '@sniptale/runtime-contracts/effect-controls';
import generated from './gl-catalog.generated.json' with { type: 'json' };

const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u);
const numeric = z.number().finite();
const uniformType = z.enum(['bool', 'float', 'int', 'ivec2', 'vec2', 'vec3', 'vec4']);
const parameter = z.strictObject({
  type: uniformType,
  default: z.union([numeric, z.boolean(), z.array(numeric).min(2).max(4)]),
  description: z.string().optional(),
  min: numeric.optional(),
  max: numeric.optional(),
  step: numeric.positive().optional(),
  color: z.boolean().optional(),
});
const asset = z.strictObject({
  path: z.string().regex(/^video-effects\/transitions\/[A-Za-z0-9_/-]+\.(?:wgsl|glsl|rgba)$/u),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const descriptor = z.strictObject({
  name: identifier,
  params: z.record(identifier, parameter),
  author: z.string(),
  license: z.enum(['MIT', 'BSD 2 Clause', 'BSD 3 Clause']),
  description: z.string(),
  tags: z.array(z.string()),
  textures: z.array(identifier).max(1),
  layout: z.strictObject({
    uniforms: z
      .array(z.strictObject({ name: identifier, type: uniformType, offset: numeric.int().min(0) }))
      .max(64),
    size: numeric.int().positive().max(4096),
    textures: z.array(identifier).max(1),
  }),
  implementation: z.strictObject({
    package: z.literal('gl-transitions'),
    version: z.literal('3.2.0'),
    adapter: z.literal(1),
    wgsl: asset,
    glsl3: asset,
  }),
});
const catalogSchema = z.strictObject({
  package: z.literal('gl-transitions'),
  version: z.literal('3.2.0'),
  adapter: z.literal(1),
  resources: z
    .array(
      asset.extend({
        name: identifier,
        width: numeric.int().positive().max(4096),
        height: numeric.int().positive().max(4096),
      })
    )
    .length(2),
  transitions: z.array(descriptor).length(214),
});
const catalog = catalogSchema.parse(generated);
type GlTransitionDescriptor = z.infer<typeof descriptor>;
type GlTransitionParameters = Record<string, number | boolean | number[]>;
export type GlTransitionSelection = {
  name: string;
  version: '3.2.0';
  adapter: 1;
  wgslSha256: string;
  glsl3Sha256: string;
  values: Record<string, number | string>;
};
export const GL_TRANSITIONS: readonly GlTransitionDescriptor[] = catalog.transitions;
export const GL_TRANSITION_RESOURCES = catalog.resources;
const byName = new Map(GL_TRANSITIONS.map((entry) => [entry.name, entry]));
if (byName.size !== 214) throw new Error('GL transition identifiers are not unique.');

/** Unknown or mismatched identities are unsupported; callers must not substitute another transition. */
export function resolveGlTransition(
  selection: Pick<
    GlTransitionSelection,
    'name' | 'version' | 'adapter' | 'wgslSha256' | 'glsl3Sha256'
  >
): GlTransitionDescriptor | null {
  const entry = byName.get(selection.name);
  return entry &&
    selection.version === entry.implementation.version &&
    selection.adapter === entry.implementation.adapter &&
    selection.wgslSha256 === entry.implementation.wgsl.sha256 &&
    selection.glsl3Sha256 === entry.implementation.glsl3.sha256
    ? entry
    : null;
}
const axes = ['x', 'y', 'z', 'w'] as const;
function rgbaHex(values: readonly number[]): string {
  return (
    '#' +
    [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1]
      .map((value) =>
        Math.round(Math.min(1, Math.max(0, value)) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

/** Flatten the pinned shader parameters into the same controls used by animation templates. */
export function glTransitionControls(entry: GlTransitionDescriptor): EffectControlSet {
  const controls: ControlDefinition[] = [];
  for (const [id, parameter] of Object.entries(entry.params)) {
    const words = id.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').replaceAll('_', ' ');
    const label = { en: words.charAt(0).toUpperCase() + words.slice(1) };
    if (typeof parameter.default === 'boolean') {
      controls.push({
        id,
        label,
        kind: 'number',
        defaultValue: parameter.default ? 1 : 0,
        min: 0,
        max: 1,
        presentation: 'toggle',
        group: 'appearance',
        options: [
          { value: 0, label: { en: 'Off' } },
          { value: 1, label: { en: 'On' } },
        ],
      });
    } else if (Array.isArray(parameter.default)) {
      if (parameter.color)
        controls.push({
          id,
          label,
          kind: 'color',
          defaultValue: rgbaHex(parameter.default),
          group: 'appearance',
        });
      else
        for (const [index, value] of parameter.default.entries())
          controls.push({
            id: `${id}.${axes[index]}`,
            label: { en: `${label.en} · ${axes[index]?.toUpperCase()}` },
            kind: 'number',
            defaultValue: value,
            min: parameter.min,
            max: parameter.max,
            step: parameter.step ?? (parameter.type === 'ivec2' ? 1 : undefined),
            group: 'appearance',
          });
    } else
      controls.push({
        id,
        label,
        kind: 'number',
        defaultValue: parameter.default,
        min: parameter.min,
        max: parameter.max,
        step: parameter.step ?? (parameter.type === 'int' ? 1 : undefined),
        group: 'appearance',
      });
  }
  return { controls };
}

/** Materialize initial values once; accepted project values remain authoritative afterwards. */
export function createGlTransitionSelection(name: string): GlTransitionSelection | null {
  const entry = byName.get(name);
  if (!entry) return null;
  return {
    name,
    version: '3.2.0',
    adapter: 1,
    wgslSha256: entry.implementation.wgsl.sha256,
    glsl3Sha256: entry.implementation.glsl3.sha256,
    values: Object.fromEntries(
      glTransitionControls(entry).controls.map((control) => [control.id, control.defaultValue])
    ),
  };
}

/** Validate all selected values, including vector components; unknown or missing controls are refused. */
export function glTransitionParameters(
  selection: GlTransitionSelection
): GlTransitionParameters | null {
  const entry = resolveGlTransition(selection);
  if (!entry) return null;
  const controls = glTransitionControls(entry).controls;
  if (Object.keys(selection.values).length !== controls.length) return null;
  for (const control of controls) {
    if (!Object.hasOwn(selection.values, control.id)) return null;
    const value = selection.values[control.id];
    if (control.kind === 'number') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        !Number.isFinite(Math.fround(value)) ||
        (control.min !== undefined && value < control.min) ||
        (control.max !== undefined && value > control.max) ||
        (control.options && !control.options.some((option) => option.value === value))
      )
        return null;
    } else if (typeof value !== 'string' || value.length > 512 || parseColor(value) === null)
      return null;
  }
  const result: GlTransitionParameters = {};
  for (const [id, parameter] of Object.entries(entry.params)) {
    let value: number | boolean | number[];
    if (typeof parameter.default === 'boolean') value = selection.values[id] === 1;
    else if (Array.isArray(parameter.default)) {
      if (parameter.color) {
        const raw = selection.values[id];
        const color = typeof raw === 'string' ? parseColor(raw) : null;
        if (!color) return null;
        value = [color.red / 255, color.green / 255, color.blue / 255, color.alpha].slice(
          0,
          parameter.default.length
        );
      } else {
        value = [];
        for (const [index] of parameter.default.entries()) {
          const part = selection.values[`${id}.${axes[index]}`];
          if (
            typeof part !== 'number' ||
            (parameter.type === 'ivec2' &&
              (!Number.isInteger(part) || part < -2147483648 || part > 2147483647))
          )
            return null;
          value.push(part);
        }
      }
    } else {
      const raw = selection.values[id];
      if (
        typeof raw !== 'number' ||
        (parameter.type === 'int' &&
          (!Number.isInteger(raw) || raw < -2147483648 || raw > 2147483647))
      )
        return null;
      value = raw;
    }
    Object.defineProperty(result, id, { value, enumerable: true });
  }
  return result;
}

/** Pack the upstream uniform layout without sharing a mutable buffer between GPU jobs. */
export function glTransitionUniforms(
  selection: GlTransitionSelection,
  progress: number,
  ratio: number
): ArrayBuffer | null {
  const entry = resolveGlTransition(selection),
    parameters = glTransitionParameters(selection);
  if (
    !entry ||
    !parameters ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 1 ||
    !Number.isFinite(ratio) ||
    !Number.isFinite(Math.fround(ratio)) ||
    Math.fround(ratio) <= 0
  )
    return null;
  const bytes = new ArrayBuffer(Math.ceil(entry.layout.size / 16) * 16),
    view = new DataView(bytes);
  for (const uniform of entry.layout.uniforms) {
    const value =
      uniform.name === 'progress'
        ? progress
        : uniform.name === 'ratio'
          ? ratio
          : parameters[uniform.name];
    const parts = Array.isArray(value)
      ? value
      : [typeof value === 'boolean' ? Number(value) : value];
    for (const [index, part] of parts.entries()) {
      if (part === undefined || uniform.offset + index * 4 + 4 > bytes.byteLength) return null;
      if (uniform.type === 'int' || uniform.type === 'ivec2' || uniform.type === 'bool')
        view.setInt32(uniform.offset + index * 4, part, true);
      else view.setFloat32(uniform.offset + index * 4, part, true);
    }
  }
  return bytes;
}

export const GL_TRANSITION_PRESET_MAX_BYTES = 256 * 1024;
interface GlTransitionPreset {
  format: 'sniptale-gl-preset';
  version: 1;
  name: string;
  transition: GlTransitionSelection;
}
const glSelectionSchema = z.strictObject({
  name: identifier.max(128),
  version: z.string().min(1).max(32),
  adapter: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  wgslSha256: z.string().regex(/^[a-f0-9]{64}$/),
  glsl3Sha256: z.string().regex(/^[a-f0-9]{64}$/),
  values: z
    .record(z.string().min(1).max(128), z.union([z.number().finite(), z.string().max(512)]))
    .refine((values) => Object.keys(values).length <= 256),
});
const glPresetFileSchema = z.strictObject({
  format: z.literal('sniptale-gl-preset'),
  version: z.literal(1),
  name: z.string().trim().min(1).max(120),
  transition: glSelectionSchema,
});
/** Project admission accepts only an exact bundled implementation and a complete uniform set. */
export function parseGlTransitionSelection(value: unknown): GlTransitionSelection | null {
  const parsed = glSelectionSchema.safeParse(value);
  if (!parsed.success || parsed.data.version !== '3.2.0' || parsed.data.adapter !== 1) return null;
  const selection: GlTransitionSelection = {
    ...parsed.data,
    version: parsed.data.version,
    adapter: parsed.data.adapter,
  };
  return glTransitionParameters(selection) ? selection : null;
}
type GlTransitionPresetImportResult =
  | { ok: true; preset: GlTransitionPreset }
  | { ok: false; code: 'invalid' }
  | { ok: false; code: 'unsupported'; source: string; name: string; transitionName: string };

/** Imported presets select only bundled, pinned implementations; no shader payload or URL is accepted. */
export function parseGlTransitionPresetJson(source: unknown): GlTransitionPresetImportResult {
  if (
    typeof source !== 'string' ||
    new TextEncoder().encode(source).byteLength > GL_TRANSITION_PRESET_MAX_BYTES
  )
    return { ok: false, code: 'invalid' };
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return { ok: false, code: 'invalid' };
  }
  const parsed = glPresetFileSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: 'invalid' };
  const reference = parsed.data.transition;
  if (reference.version !== '3.2.0' || reference.adapter !== 1)
    return {
      ok: false,
      code: 'unsupported',
      source,
      name: parsed.data.name,
      transitionName: reference.name,
    };
  const transition: GlTransitionSelection = {
    ...reference,
    version: reference.version,
    adapter: reference.adapter,
  };
  if (!resolveGlTransition(transition))
    return {
      ok: false,
      code: 'unsupported',
      source,
      name: parsed.data.name,
      transitionName: reference.name,
    };
  if (!glTransitionParameters(transition)) return { ok: false, code: 'invalid' };
  return { ok: true, preset: { ...parsed.data, transition } };
}
export function importGlTransitionPresetBytes(bytes: Uint8Array): GlTransitionPresetImportResult {
  if (!bytes.byteLength || bytes.byteLength > GL_TRANSITION_PRESET_MAX_BYTES)
    return { ok: false, code: 'invalid' };
  try {
    return parseGlTransitionPresetJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, code: 'invalid' };
  }
}
/** A portable file contains effective parameters and implementation identity, never project or media data. */
export function exportGlTransitionPreset(
  transition: GlTransitionSelection,
  name: string
): { blob: Blob; filename: string } {
  const reference = {
    name: transition.name,
    version: transition.version,
    adapter: transition.adapter,
    wgslSha256: transition.wgslSha256,
    glsl3Sha256: transition.glsl3Sha256,
    values: { ...transition.values },
  };
  const parsed = parseGlTransitionPresetJson(
    JSON.stringify({ format: 'sniptale-gl-preset', version: 1, name, transition: reference })
  );
  if (!parsed.ok) throw new Error('GL transition preset is invalid or unavailable.');
  const slug =
    Array.from(
      parsed.preset.name
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}_.-]+/gu, '-')
        .replace(/^[-.]+|[-.]+$/gu, '')
    )
      .slice(0, 80)
      .join('') || transition.name;
  const source = JSON.stringify(parsed.preset);
  return {
    blob: new Blob([source], { type: 'application/json' }),
    filename: `sniptale-transition-${slug}.sniptale-gl-preset.json`,
  };
}
