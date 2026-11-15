import { z } from 'zod';
import { effectControlSetSchema, effectLocaleLabelSchema } from '../effect-controls/index.js';
import { validateEffectControlPresetValues } from '../effect-controls/presets.js';
import { isPlainRecord } from '../validation/primitives.js';
import { estimateUtf8Bytes } from '../validation/base64.js';
import validateLottieSchema from './lottie-schema.generated.js';
import {
  isAnimationResourcePath,
  verifyAnimationResource,
  animationResourceRasterSize,
} from './assets.js';
import {
  ANIMATION_TEMPLATE_FORMAT,
  ANIMATION_TEMPLATE_VERSION,
  ANIMATION_TEMPLATE_LIMITS as LIMITS,
  type AnimationDiagnostic,
  type AnimationValidationResult,
  type AnimationTemplate,
  type AnimationTemplateSlot,
} from './types.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const label = effectLocaleLabelSchema;
const path = z.string().refine(isAnimationResourcePath);
const positive = z.number().finite().positive();
const binding = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), slot: id, control: id }),
  z.strictObject({ kind: z.literal('color'), slot: id, control: id }),
  z.strictObject({
    kind: z.literal('scalar'),
    slot: id,
    control: id,
    unit: z.enum(['identity', 'percent-to-ratio', 'degrees-to-radians']).optional(),
  }),
  z.strictObject({
    kind: z.literal('vector'),
    slot: id,
    xControl: id,
    yControl: id,
    unit: z.enum(['identity', 'normalized-to-pixels']).optional(),
  }),
]);
const resource = z.strictObject({
  path,
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'font/ttf', 'font/otf']),
  fontFamily: z.string().min(1).max(256).optional(),
  byteLength: positive.int().max(LIMITS.resourceBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  base64: z.string().max(Math.ceil(LIMITS.resourceBytes / 3) * 4),
});
const objectLayout = z.strictObject({
  arrow: z
    .strictObject({
      start: z.strictObject({ xControl: id, yControl: id }),
      end: z.strictObject({ xControl: id, yControl: id }),
      widthControl: id,
      positionSlot: id,
      rotationSlot: id,
      shaftScaleSlot: id,
      headPositionSlot: id,
      headScaleSlot: id,
    })
    .optional(),
  handles: z
    .array(
      z.strictObject({
        id,
        label,
        xControl: id,
        yControl: id,
        padding: z.number().finite().min(0).max(256).default(16),
      })
    )
    .min(1)
    .max(8)
    .optional(),
  reflow: z
    .strictObject({
      kind: z.enum(['caption', 'callout']),
      textControl: id,
      fontResource: path,
      fontSizeControl: id,
      widthControl: id,
      padding: z.number().finite().min(0).max(4096),
      minFontSize: positive.max(1024),
      lineHeight: positive.max(4),
      maxLines: positive.int().max(128),
      textSlot: id,
      boxSizeSlot: id,
      boxPositionSlot: id,
      textPositionSlot: id,
      pointer: z
        .strictObject({
          positionSlot: id,
          scaleSlot: id,
          rotationSlot: id,
          width: positive.max(256),
        })
        .optional(),
      tip: z.strictObject({ xControl: id, yControl: id }).optional(),
    })
    .optional(),
});
const templateSchema = z.strictObject({
  format: z.literal(ANIMATION_TEMPLATE_FORMAT),
  version: z.literal(ANIMATION_TEMPLATE_VERSION),
  id,
  label,
  description: label.optional(),
  tags: z.array(z.string().min(1).max(128)).max(64).optional(),
  animation: z
    .object({
      w: positive,
      h: positive,
      fr: positive,
      ip: z.number().finite(),
      op: z.number().finite(),
      layers: z.array(z.unknown()),
    })
    .catchall(z.unknown()),
  resources: z.array(resource).max(LIMITS.resources),
  bindings: z.array(binding).max(256),
  objectLayout: objectLayout.optional(),
  ...effectControlSetSchema.shape,
});

/** Bound the tree before schema evaluation. Reject cycles, accessors and non-JSON values at IPC boundaries. */
function inspectTree(value: unknown, diagnostics: AnimationDiagnostic[]): boolean {
  const pending = [{ value, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0,
    characters = 0;
  const refuse = () => {
    diagnostics.push({
      code: 'ANIMATION_JSON_BUDGET',
      path: '$',
      message: 'Use bounded, acyclic JSON without executable properties.',
    });
    return false;
  };
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > LIMITS.nodes || entry.depth > LIMITS.depth) return refuse();
    if (typeof entry.value === 'string') {
      characters += entry.value.length;
      if (characters > LIMITS.stringCharacters) return refuse();
      continue;
    }
    if (
      entry.value === null ||
      typeof entry.value === 'boolean' ||
      (typeof entry.value === 'number' && Number.isFinite(entry.value))
    )
      continue;
    if (typeof entry.value !== 'object' || seen.has(entry.value)) return refuse();
    const prototype: unknown = Object.getPrototypeOf(entry.value);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null)
      return refuse();
    seen.add(entry.value);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(entry.value))) {
      if (Array.isArray(entry.value) && key === 'length') continue;
      characters += key.length;
      if (
        !('value' in descriptor) ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype'
      )
        return refuse();
      const child: unknown = descriptor.value;
      pending.push({ value: child, depth: entry.depth + 1 });
    }
    if (characters > LIMITS.stringCharacters || pending.length + nodes > LIMITS.nodes)
      return refuse();
  }
  return true;
}

function slotKind(
  animation: Record<string, unknown>,
  name: string
): 'text' | 'color' | 'scalar' | 'vector' | null {
  const slots = animation['slots'];
  if (!isPlainRecord(slots) || !Object.hasOwn(slots, name)) return null;
  const slot = slots[name];
  if (!isPlainRecord(slot) || !isPlainRecord(slot['p'])) return null;
  const property = slot['p'];
  if (property['a'] !== 0) return null;
  const value = property['k'];
  if (typeof value === 'number') return 'scalar';
  if (!Array.isArray(value)) return null;
  if (
    value.length === 1 &&
    isPlainRecord(value[0]) &&
    isPlainRecord(value[0]['s']) &&
    typeof value[0]['s']['t'] === 'string'
  )
    return 'text';
  if (
    (value.length === 3 || value.length === 4) &&
    value.every((part) => typeof part === 'number' && part >= 0 && part <= 1)
  )
    return 'color';
  if (
    value.length === 2 &&
    value.every((part) => typeof part === 'number' && Number.isFinite(part))
  )
    return 'vector';
  return null;
}

/** Describe accepted named slots without giving preparation another interpretation of their types. */
export function listAnimationTemplateSlots(template: AnimationTemplate): AnimationTemplateSlot[] {
  const slots = template.animation['slots'];
  if (!isPlainRecord(slots)) return [];
  const bound = new Set(template.bindings.map((binding) => binding.slot));
  const arrow = template.objectLayout?.arrow;
  const reflow = template.objectLayout?.reflow;
  const owned = new Set([
    arrow?.positionSlot,
    arrow?.rotationSlot,
    arrow?.shaftScaleSlot,
    arrow?.headPositionSlot,
    arrow?.headScaleSlot,
    reflow?.textSlot,
    reflow?.boxSizeSlot,
    reflow?.boxPositionSlot,
    reflow?.textPositionSlot,
    reflow?.pointer?.positionSlot,
    reflow?.pointer?.scaleSlot,
    reflow?.pointer?.rotationSlot,
  ]);
  return Object.keys(slots).map((name) => {
    const slot = slots[name];
    const property = isPlainRecord(slot) && isPlainRecord(slot['p']) ? slot['p'] : null;
    const kind = slotKind(template.animation, name);
    const raw = property?.['k'];
    let value: AnimationTemplateSlot['value'] = null;
    if (kind === 'scalar' && typeof raw === 'number') value = raw;
    else if (kind === 'text' && Array.isArray(raw)) {
      const first: unknown = raw[0];
      const text = isPlainRecord(first) ? first['s'] : null;
      if (isPlainRecord(text) && typeof text['t'] === 'string') value = text['t'];
    } else if (Array.isArray(raw)) {
      const parts: unknown[] = raw;
      if (parts.every((part): part is number => typeof part === 'number')) value = parts.slice();
    }
    const unavailable =
      property?.['a'] === 1
        ? 'animated'
        : !kind || !id.safeParse(name).success
          ? 'unsupported'
          : bound.has(name)
            ? 'bound'
            : owned.has(name)
              ? 'layout'
              : null;
    return { id: name, kind, value, unavailable };
  });
}

function inspectProfile(template: AnimationTemplate, diagnostics: AnimationDiagnostic[]): void {
  const error = (code: string, path: string, message: string) =>
    diagnostics.push({ code, path, message });
  const animation = template.animation;
  const w = animation['w'],
    h = animation['h'],
    fr = animation['fr'],
    ip = animation['ip'],
    op = animation['op'];
  if (
    typeof w !== 'number' ||
    typeof h !== 'number' ||
    !Number.isSafeInteger(w) ||
    !Number.isSafeInteger(h) ||
    w < 1 ||
    h < 1 ||
    w > LIMITS.dimension ||
    h > LIMITS.dimension ||
    w * h > LIMITS.rasterPixels ||
    typeof fr !== 'number' ||
    fr <= 0 ||
    fr > LIMITS.frameRate ||
    typeof ip !== 'number' ||
    typeof op !== 'number' ||
    op <= ip ||
    ip < 0 ||
    (op - ip) / fr > LIMITS.durationSeconds
  )
    error(
      'ANIMATION_TIMING',
      '$.animation',
      'Use bounded dimensions, frame rate and a positive frame interval.'
    );
  const resources = new Map(template.resources.map((entry) => [entry.path, entry]));
  if (
    resources.size !== template.resources.length ||
    template.resources.reduce((sum, entry) => sum + entry.byteLength, 0) > LIMITS.totalResourceBytes
  )
    error(
      'ANIMATION_RESOURCES',
      '$.resources',
      'Resource paths must be unique and total bytes bounded.'
    );
  let decodedRasterBytes = 0;
  for (const resource of template.resources)
    if (resource.mimeType.startsWith('image/')) {
      const size = animationResourceRasterSize(resource);
      if (!size)
        error(
          'ANIMATION_RASTER_DIMENSIONS',
          '$.resources',
          'Image dimensions exceed the supported budget or are unavailable.'
        );
      else decodedRasterBytes += size.width * size.height * 4;
    }
  if (decodedRasterBytes > LIMITS.decodedRasterBytes)
    error(
      'ANIMATION_RASTER_BUDGET',
      '$.resources',
      'Decoded images exceed the retained raster budget.'
    );
  const fontFamilies = new Set<string>();
  for (const resource of template.resources) {
    if (resource.mimeType.startsWith('font/')) {
      if (!resource.fontFamily || fontFamilies.has(resource.fontFamily))
        error(
          'ANIMATION_FONT_RESOURCE',
          '$.resources',
          'Fonts require unique declared family names.'
        );
      if (resource.fontFamily) fontFamilies.add(resource.fontFamily);
    } else if (resource.fontFamily !== undefined)
      error(
        'ANIMATION_FONT_RESOURCE',
        '$.resources',
        'Image resources cannot declare a font family.'
      );
  }
  const fonts = animation['fonts'];
  if (isPlainRecord(fonts) && Array.isArray(fonts['list'])) {
    for (const font of fonts['list']) {
      if (
        !isPlainRecord(font) ||
        typeof font['fName'] !== 'string' ||
        typeof font['fFamily'] !== 'string' ||
        !fontFamilies.has(font['fFamily']) ||
        (font['fPath'] !== undefined &&
          font['fPath'] !== '' &&
          (typeof font['fPath'] !== 'string' ||
            !resources.get(font['fPath'])?.mimeType.startsWith('font/')))
      )
        error(
          'ANIMATION_FONT_RESOURCE',
          '$.animation.fonts',
          'Every font must resolve to a declared local family.'
        );
    }
  }
  const pending: { value: unknown; path: string }[] = [{ value: animation, path: '$.animation' }];
  let layers = 0,
    paths = 0,
    keyframes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (Array.isArray(entry.value)) {
      for (const [index, value] of entry.value.entries())
        pending.push({ value, path: `${entry.path}[${index}]` });
      continue;
    }
    if (!isPlainRecord(entry.value)) continue;
    const value = entry.value;
    for (const [key, child] of Object.entries(value)) {
      if (
        [
          'expression',
          'expressions',
          'script',
          'scripts',
          'stateMachines',
          'stateMachine',
          'javascript',
        ].includes(key)
      )
        error('ANIMATION_EXECUTABLE', `${entry.path}.${key}`, 'Executable input is not supported.');
      if (key === 'x' && typeof child === 'string')
        error('ANIMATION_EXPRESSION', `${entry.path}.x`, 'Expressions are not supported.');
      if ((key === 'url' || key === 'href') && child !== '')
        error(
          'ANIMATION_EXTERNAL_RESOURCE',
          `${entry.path}.${key}`,
          'Use declared package-local resources.'
        );
      if (key === 'layers' && Array.isArray(child)) {
        layers += child.length;
        for (const layer of child)
          if (
            !isPlainRecord(layer) ||
            typeof layer['ty'] !== 'number' ||
            ![0, 1, 2, 3, 4, 5].includes(layer['ty']) ||
            layer['ddd'] === 1
          )
            error(
              'ANIMATION_LAYER',
              `${entry.path}.layers`,
              'Use supported two-dimensional layers.'
            );
      }
      if (key === 'v' && Array.isArray(child)) paths += child.length;
      if (key === 'k' && Array.isArray(child) && isPlainRecord(child[0]) && 't' in child[0])
        keyframes += child.length;
      pending.push({ value: child, path: `${entry.path}.${key}` });
    }
    if (typeof value['p'] === 'string') {
      const prefix = value['u'] === undefined ? '' : value['u'];
      const resourcePath = typeof prefix === 'string' ? prefix + value['p'] : '';
      if (
        !isAnimationResourcePath(resourcePath) ||
        !resources.has(resourcePath) ||
        !resources.get(resourcePath)!.mimeType.startsWith('image/') ||
        value['e'] === 1
      )
        error('ANIMATION_IMAGE_RESOURCE', entry.path, 'Images require a declared local resource.');
    }
  }
  if (layers > LIMITS.layers || paths > LIMITS.paths || keyframes > LIMITS.keyframes)
    error(
      'ANIMATION_COMPLEXITY',
      '$.animation',
      'Animation complexity exceeds the supported budget.'
    );
  const assets = Array.isArray(animation['assets']) ? animation['assets'] : [];
  const assetMap = new Map<string, Record<string, unknown>>();
  for (const asset of assets) {
    if (!isPlainRecord(asset) || typeof asset['id'] !== 'string' || assetMap.has(asset['id']))
      error('ANIMATION_ASSET_REFERENCE', '$.animation.assets', 'Asset identities must be unique.');
    else assetMap.set(asset['id'], asset);
  }
  if (assetMap.size > LIMITS.resources)
    error(
      'ANIMATION_ASSETS',
      '$.animation.assets',
      'Animation asset count exceeds the supported budget.'
    );
  const compositions = new Map<string, unknown[]>([
    ['$root', Array.isArray(animation['layers']) ? animation['layers'] : []],
  ]);
  for (const [id, asset] of assetMap)
    if (Array.isArray(asset['layers'])) compositions.set(id, asset['layers']);
  const references = new Map<string, string[]>();
  for (const [id, entries] of compositions) {
    const parents = new Map<number, number>();
    const indices = new Set<number>();
    const children: string[] = [];
    for (const layer of entries) {
      if (!isPlainRecord(layer)) continue;
      if (typeof layer['ind'] === 'number') {
        if (indices.has(layer['ind']))
          error(
            'ANIMATION_LAYER_REFERENCE',
            '$.animation.layers',
            'Layer indices must be unique within a composition.'
          );
        indices.add(layer['ind']);
        if (typeof layer['parent'] === 'number') parents.set(layer['ind'], layer['parent']);
      }
      if (layer['ty'] === 0 || layer['ty'] === 2) {
        const reference = layer['refId'];
        const asset = typeof reference === 'string' ? assetMap.get(reference) : undefined;
        if (
          !asset ||
          (layer['ty'] === 0 && !Array.isArray(asset['layers'])) ||
          (layer['ty'] === 2 && typeof asset['p'] !== 'string')
        )
          error(
            'ANIMATION_ASSET_REFERENCE',
            '$.animation.layers',
            'Layer source does not resolve to a matching local asset.'
          );
        if (layer['ty'] === 0 && typeof reference === 'string') children.push(reference);
      }
    }
    for (const index of indices) {
      const chain = new Set<number>();
      let current: number | undefined = index;
      while (current !== undefined) {
        if (!indices.has(current) || chain.has(current) || chain.size > LIMITS.depth) {
          error(
            'ANIMATION_LAYER_REFERENCE',
            '$.animation.layers',
            'Layer parents must resolve without cycles.'
          );
          break;
        }
        chain.add(current);
        current = parents.get(current);
      }
    }
    references.set(id, children);
  }
  const completed = new Set<string>();
  const visit = (id: string, chain: ReadonlySet<string>) => {
    if (chain.has(id) || chain.size > LIMITS.depth) {
      error(
        'ANIMATION_PRECOMPOSITION_CYCLE',
        '$.animation.assets',
        'Precomposition references must be acyclic and bounded.'
      );
      return;
    }
    if (completed.has(id)) return;
    const next = new Set(chain);
    next.add(id);
    for (const child of references.get(id) ?? []) visit(child, next);
    completed.add(id);
  };
  for (const id of compositions.keys()) visit(id, new Set());
  const controls = new Map(template.controls.map((entry) => [entry.id, entry]));
  const bound = new Set<string>();
  for (const [index, binding] of template.bindings.entries()) {
    const kind = slotKind(animation, binding.slot);
    const ids =
      binding.kind === 'vector' ? [binding.xControl, binding.yControl] : [binding.control];
    const expected =
      binding.kind === 'scalar' || binding.kind === 'vector' ? 'number' : binding.kind;
    if (
      bound.has(binding.slot) ||
      kind !== binding.kind ||
      ids.some((id) => controls.get(id)?.kind !== expected)
    )
      error(
        'ANIMATION_SLOT_BINDING',
        `$.bindings[${index}]`,
        'Bind each declared slot once to controls of its type.'
      );
    bound.add(binding.slot);
  }
  const handles = template.objectLayout?.handles ?? [];
  if (new Set(handles.map((entry) => entry.id)).size !== handles.length)
    error('ANIMATION_HANDLES', '$.objectLayout.handles', 'Handle IDs must be unique.');
  for (const handle of handles) {
    const axes = [controls.get(handle.xControl), controls.get(handle.yControl)];
    if (
      handle.xControl === handle.yControl ||
      axes.some(
        (axis) =>
          axis?.kind !== 'number' ||
          axis.min === undefined ||
          axis.max === undefined ||
          axis.min < -1_000_000 ||
          axis.max > 1_000_000
      )
    )
      error(
        'ANIMATION_HANDLE_BINDING',
        '$.objectLayout.handles',
        'Handles require separate bounded numeric coordinate controls.'
      );
  }
  for (const preset of template.controlPresets ?? [])
    if (!validateEffectControlPresetValues(template, preset.values).ok)
      error(
        'ANIMATION_PRESET',
        '$.controlPresets',
        'Presets must preserve text and geometry handles.'
      );
  const arrow = template.objectLayout?.arrow;
  if (arrow) {
    const width = controls.get(arrow.widthControl);
    const outputs = [
      arrow.positionSlot,
      arrow.rotationSlot,
      arrow.shaftScaleSlot,
      arrow.headPositionSlot,
      arrow.headScaleSlot,
    ];
    const endpoints = [arrow.start, arrow.end];
    const matchedHandles = endpoints.map((point) =>
      handles.find(
        (handle) => handle.xControl === point.xControl && handle.yControl === point.yControl
      )
    );
    if (
      template.objectLayout?.reflow ||
      new Set(endpoints.flatMap((point) => [point.xControl, point.yControl])).size !== 4 ||
      width?.kind !== 'number' ||
      width.min === undefined ||
      width.min <= 0 ||
      width.max === undefined ||
      width.max > 128 ||
      matchedHandles.some(
        (handle) =>
          !handle ||
          (handle.padding ?? 16) < (width.kind === 'number' ? (width.max ?? 128) * 1.5 : 192)
      ) ||
      new Set(outputs).size !== 5 ||
      outputs.some((slot) => bound.has(slot)) ||
      outputs.some(
        (slot) => slotKind(animation, slot) !== (slot === arrow.rotationSlot ? 'scalar' : 'vector')
      )
    )
      error(
        'ANIMATION_ARROW_BINDING',
        '$.objectLayout.arrow',
        'Arrow geometry requires distinct typed slots, two bounded handles and sufficient stroke padding.'
      );
  }
  const layout = template.objectLayout?.reflow;
  if (
    layout &&
    (controls.get(layout.textControl)?.kind !== 'text' ||
      controls.get(layout.fontSizeControl)?.kind !== 'number' ||
      controls.get(layout.widthControl)?.kind !== 'number' ||
      !resources.get(layout.fontResource)?.mimeType.startsWith('font/') ||
      slotKind(animation, layout.textSlot) !== 'text' ||
      slotKind(animation, layout.boxSizeSlot) !== 'vector' ||
      slotKind(animation, layout.boxPositionSlot) !== 'vector' ||
      slotKind(animation, layout.textPositionSlot) !== 'vector' ||
      Boolean(layout.pointer) !== Boolean(layout.tip) ||
      (layout.tip &&
        (layout.tip.xControl === layout.tip.yControl ||
          controls.get(layout.tip.xControl)?.kind !== 'number' ||
          controls.get(layout.tip.yControl)?.kind !== 'number' ||
          !handles.some(
            (handle) =>
              handle.xControl === layout.tip?.xControl && handle.yControl === layout.tip?.yControl
          ))) ||
      (layout.pointer &&
        (slotKind(animation, layout.pointer.positionSlot) !== 'vector' ||
          slotKind(animation, layout.pointer.scaleSlot) !== 'vector' ||
          slotKind(animation, layout.pointer.rotationSlot) !== 'scalar')) ||
      new Set([
        layout.textSlot,
        layout.boxSizeSlot,
        layout.boxPositionSlot,
        layout.textPositionSlot,
        ...(layout.pointer
          ? [layout.pointer.positionSlot, layout.pointer.scaleSlot, layout.pointer.rotationSlot]
          : []),
      ]).size !== (layout.pointer ? 7 : 4))
  )
    error(
      'ANIMATION_REFLOW_BINDING',
      '$.objectLayout.reflow',
      'Reflow requires matching local font, numeric geometry and typed slots.'
    );
}

/** Validate metadata and the supported Lottie profile before immutable storage or worker dispatch. */
export function validateAnimationTemplate(value: unknown): AnimationValidationResult {
  const diagnostics: AnimationDiagnostic[] = [];
  if (!inspectTree(value, diagnostics)) return { ok: false, template: null, diagnostics };
  const result = templateSchema.safeParse(value);
  if (!result.success)
    return {
      ok: false,
      template: null,
      diagnostics: result.error.issues.map((issue) => ({
        code: 'ANIMATION_MANIFEST',
        path: '$.' + issue.path.join('.'),
        message: issue.message,
      })),
    };
  const template: AnimationTemplate = structuredClone(result.data);
  const metadata = effectControlSetSchema.safeParse({
    controls: template.controls,
    ...(template.controlGroups ? { controlGroups: template.controlGroups } : {}),
    ...(template.controlPresets ? { controlPresets: template.controlPresets } : {}),
    ...(template.defaultControlPresetId
      ? { defaultControlPresetId: template.defaultControlPresetId }
      : {}),
  });
  if (!metadata.success)
    diagnostics.push({
      code: 'ANIMATION_CONTROLS',
      path: '$.controls',
      message: 'Control metadata is invalid.',
    });
  inspectProfile(template, diagnostics);
  if (!diagnostics.length && !validateLottieSchema(template.animation))
    diagnostics.push({
      code: 'ANIMATION_SCHEMA',
      path: '$.animation',
      message: 'Animation does not conform to the pinned Lottie schema.',
    });
  return diagnostics.length
    ? { ok: false, template: null, diagnostics }
    : { ok: true, template, diagnostics: [] };
}

function hasBoundedJsonStructure(text: string): boolean {
  let depth = 0,
    nodes = 1,
    stringCharacters = 0,
    inString = false,
    escaped = false;
  for (const character of text) {
    if (inString) {
      stringCharacters++;
      if (stringCharacters > LIMITS.stringCharacters) return false;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      nodes++;
    } else if (character === '{' || character === '[') {
      depth++;
      nodes++;
      if (depth > LIMITS.depth) return false;
    } else if (character === '}' || character === ']') {
      depth--;
      if (depth < 0) return false;
    } else if (character === ',' || character === ':') nodes++;
    if (nodes > LIMITS.nodes) return false;
  }
  return depth === 0 && !inString;
}

/** JSON entry admission checks encoded size before parsing and validates resource bytes before publication. */
export function parseAnimationTemplateSource(text: string): AnimationValidationResult {
  if (estimateUtf8Bytes(text, LIMITS.jsonBytes) > LIMITS.jsonBytes)
    return {
      ok: false,
      template: null,
      diagnostics: [
        {
          code: 'ANIMATION_JSON_BYTES',
          path: '$',
          message: 'Animation JSON exceeds the byte budget.',
        },
      ],
    };
  if (!hasBoundedJsonStructure(text))
    return {
      ok: false,
      template: null,
      diagnostics: [
        {
          code: 'ANIMATION_JSON_BUDGET',
          path: '$',
          message: 'Animation JSON exceeds the structural budget.',
        },
      ],
    };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ok: false,
      template: null,
      diagnostics: [{ code: 'ANIMATION_JSON', path: '$', message: 'Animation JSON is malformed.' }],
    };
  }
  return validateAnimationTemplate(value);
}

/** Verify accepted resource bytes at import/storage admission on the host, before publication. */
export async function parseAnimationTemplateJson(text: string): Promise<AnimationValidationResult> {
  const result = parseAnimationTemplateSource(text);
  if (!result.ok) return result;
  for (const resource of result.template.resources)
    if (!(await verifyAnimationResource(resource)))
      return {
        ok: false,
        template: null,
        diagnostics: [
          {
            code: 'ANIMATION_RESOURCE_BYTES',
            path: '$.resources',
            message: 'Resource bytes, type or digest do not match their declaration.',
          },
        ],
      };
  return result;
}
