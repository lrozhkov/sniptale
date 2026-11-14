import { Color } from 'fabric';
import { sanitizeSvgFragment } from '@sniptale/platform/security/sanitizers/svg';
import {
  isEditorVectorDefinition,
  isEditorVectorProvenance,
  computeEditorVectorDefinitionDigest,
  serializeEditorVectorDefinition,
  type EditorVectorDefinition,
  type EditorVectorProvenance,
  type EditorVectorSlot,
} from '../../../features/editor/document/vector-element';

const NS = 'http://www.w3.org/2000/svg';
const LIMIT = 131072;
const COMMON = [
  'id',
  'transform',
  'fill',
  'stroke',
  'color',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'fill-rule',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
];
const GEOMETRY: Record<string, string[]> = {
  svg: ['xmlns', 'viewBox', 'width', 'height', 'preserveAspectRatio'],
  g: [],
  path: ['d'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polygon: ['points'],
  polyline: ['points'],
  title: [],
  desc: [],
};
const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/** A fixed refusal code is safe to propagate without exposing imported content. */
export class EditorVectorValidationError extends Error {
  constructor(
    public readonly code:
      | 'unsafe-svg'
      | 'unsupported-svg'
      | 'invalid-svg'
      | 'budget-exceeded'
      | 'invalid-definition'
  ) {
    super(`Vector element refused: ${code}.`);
    this.name = 'EditorVectorValidationError';
  }
}

function refuse(code: EditorVectorValidationError['code']): never {
  throw new EditorVectorValidationError(code);
}

function isDigit(value: string, index: number): boolean {
  const code = value.charCodeAt(index);
  return code >= 48 && code <= 57;
}

function numberEnd(value: string, start: number): number | null {
  let index = start;
  if (value[index] === '+' || value[index] === '-') index++;
  const integerStart = index;
  while (isDigit(value, index)) index++;
  const hasInteger = index > integerStart;
  if (value[index] === '.') {
    index++;
    const fractionStart = index;
    while (isDigit(value, index)) index++;
    if (!hasInteger && index === fractionStart) return null;
  } else if (!hasInteger) return null;
  if (value[index] === 'e' || value[index] === 'E') {
    const exponentStart = index;
    index++;
    if (value[index] === '+' || value[index] === '-') index++;
    const digitsStart = index;
    while (isDigit(value, index)) index++;
    if (index === digitsStart) index = exponentStart;
  }
  return index;
}

function numbers(value: string): number[] {
  const result: number[] = [];
  let index = 0;
  while (index < value.length) {
    if (/[\s,]/u.test(value[index]!)) {
      index++;
      continue;
    }
    const end = numberEnd(value, index);
    if (end === null) refuse('invalid-svg');
    result.push(Number(value.slice(index, end)));
    index = end;
  }
  if (result.some((number) => !Number.isFinite(number) || Math.abs(number) > LIMIT))
    refuse('budget-exceeded');
  return result;
}

function scalar(value: string): number {
  const parsed = numbers(value);
  if (parsed.length !== 1) refuse('invalid-svg');
  return parsed[0]!;
}

function color(value: string): string {
  if (value.length > 128 || /[;{}\\]|url\s*\(|var\s*\(/iu.test(value)) refuse('unsafe-svg');
  const parsed = new Color(value.toLowerCase());
  if (parsed.isUnrecognised || parsed.getSource().some((number) => !Number.isFinite(number)))
    refuse('unsupported-svg');
  return `#${(parsed.getAlpha() === 1 ? parsed.toHex() : parsed.toHexa()).toLowerCase()}`;
}

function validatePath(value: string): number {
  if (value.length > 2097152) refuse('budget-exceeded');
  value = value.trim();
  const pieces = Array.from(value.matchAll(/([a-df-zA-DF-Z])([^a-df-zA-DF-Z]*)/gu));
  if (pieces.map((piece) => piece[0]).join('') !== value.trim() || !/^[mM]/u.test(value.trim()))
    refuse('invalid-svg');
  let count = 0;
  for (const piece of pieces) {
    const command = piece[1]!.toUpperCase();
    const arity = ARITY[command];
    if (arity === undefined) refuse('unsupported-svg');
    const args = command === 'A' ? arcNumbers(piece[2]!) : numbers(piece[2]!);
    if (arity === 0 ? args.length !== 0 : args.length === 0 || args.length % arity !== 0)
      refuse('invalid-svg');
    if (command === 'A') {
      for (let index = 0; index < args.length; index += 7) {
        if (
          args[index]! < 0 ||
          args[index + 1]! < 0 ||
          ![0, 1].includes(args[index + 3]!) ||
          ![0, 1].includes(args[index + 4]!)
        )
          refuse('invalid-svg');
      }
    }
    count += arity ? args.length / arity : 1;
  }
  return count;
}

function arcNumbers(value: string): number[] {
  const args: number[] = [];
  const trimmed = value.trim();
  let index = 0;
  while (index < trimmed.length) {
    const flag = args.length % 7 === 3 || args.length % 7 === 4;
    const end = flag
      ? trimmed[index] === '0' || trimmed[index] === '1'
        ? index + 1
        : null
      : numberEnd(trimmed, index);
    if (end === null) refuse('invalid-svg');
    const number = Number(trimmed.slice(index, end));
    if (!Number.isFinite(number) || Math.abs(number) > LIMIT) refuse('budget-exceeded');
    args.push(number);
    index = end;
    while (index < trimmed.length && /[\s,]/u.test(trimmed[index]!)) index++;
  }
  return args;
}

function isSupportedAspectRatio(value: string): boolean {
  if (value === 'none') return true;
  const parts = value.split(/\s+/u);
  if (!/^x(?:Min|Mid|Max)Y(?:Min|Mid|Max)$/u.test(parts[0]!)) return false;
  return (
    parts.length === 1 || (parts.length === 2 && (parts[1] === 'meet' || parts[1] === 'slice'))
  );
}

function validateTransform(value: string): void {
  const pieces = Array.from(
    value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/gu)
  );
  if (pieces.length > 40) refuse('budget-exceeded');
  if (
    value
      .replace(/(matrix|translate|scale|rotate|skewX|skewY)\s*\([^()]*\)/gu, '')
      .replace(/[\s,]/gu, '')
  )
    refuse('unsupported-svg');
  for (const piece of pieces) {
    const args = numbers(piece[2]!);
    const length = args.length;
    if (
      piece[1] === 'matrix'
        ? length !== 6
        : piece[1] === 'rotate'
          ? length !== 1 && length !== 3
          : piece[1] === 'translate' || piece[1] === 'scale'
            ? length !== 1 && length !== 2
            : length !== 1
    )
      refuse('invalid-svg');
  }
}

function validateAttributes(element: Element, tag: string): void {
  const allowed = GEOMETRY[tag];
  if (!allowed) refuse('unsupported-svg');
  for (const attribute of Array.from(element.attributes)) {
    const { name, value } = attribute;
    if (
      name.startsWith('on') ||
      name === 'style' ||
      (/url\s*\(|(?:javascript|data|https?):/iu.test(value) && name !== 'xmlns')
    )
      refuse('unsafe-svg');
    if (!COMMON.includes(name) && !allowed.includes(name)) refuse('unsupported-svg');
    if (name === 'xmlns') {
      if (value !== NS) refuse('invalid-svg');
    } else if (name === 'id' || name === 'd' || name === 'viewBox') continue;
    else if (name === 'preserveAspectRatio') {
      if (!isSupportedAspectRatio(value)) refuse('unsupported-svg');
    } else if (name === 'transform') validateTransform(value);
    else if (name === 'fill' || name === 'stroke' || name === 'color') {
      if (value !== 'none' && value !== 'currentColor') color(value);
    } else if (name === 'fill-rule') {
      if (value !== 'nonzero' && value !== 'evenodd') refuse('unsupported-svg');
    } else if (name === 'stroke-linecap') {
      if (!['butt', 'round', 'square'].includes(value)) refuse('unsupported-svg');
    } else if (name === 'stroke-linejoin') {
      if (!['miter', 'round', 'bevel'].includes(value)) refuse('unsupported-svg');
    } else if (name === 'points') {
      const entries = numbers(value);
      if (entries.length < 4 || entries.length % 2) refuse('invalid-svg');
    } else if (name === 'stroke-dasharray') {
      if (
        value !== 'none' &&
        (numbers(value).length === 0 || numbers(value).some((entry) => entry < 0))
      )
        refuse('invalid-svg');
    } else {
      const number = scalar(value);
      if (
        (name.endsWith('opacity') && (number < 0 || number > 1)) ||
        (['width', 'height', 'r', 'rx', 'ry', 'stroke-width', 'stroke-miterlimit'].includes(name) &&
          number < 0)
      )
        refuse('invalid-svg');
    }
  }
}

function canonicalXml(element: Element): string {
  const attributes = Array.from(element.attributes).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  );
  const escape = (value: string) =>
    value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');
  const serializedAttributes = attributes
    .map((attribute) => ` ${attribute.name}="${escape(attribute.value)}"`)
    .join('');
  const children = Array.from(element.children, canonicalXml).join('');
  return `<${element.localName}${serializedAttributes}>${children}</${element.localName}>`;
}

function normalizeArtwork(
  svg: string
): Pick<EditorVectorDefinition, 'viewBox' | 'svg' | 'slots' | 'capabilities'> {
  if (new TextEncoder().encode(svg).byteLength > 2097152) refuse('budget-exceeded');
  if (
    /<!DOCTYPE|<!ENTITY|<\?/iu.test(svg) ||
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/iu.test(svg)
  )
    refuse('unsafe-svg');
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (document.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== NS)
    refuse('invalid-svg');
  const boxNumbers = numbers(
    root.getAttribute('viewBox') ??
      `0 0 ${root.getAttribute('width') ?? ''} ${root.getAttribute('height') ?? ''}`
  );
  if (boxNumbers.length !== 4 || boxNumbers[2]! <= 0 || boxNumbers[3]! <= 0) refuse('invalid-svg');
  const viewBox = {
    minX: boxNumbers[0]!,
    minY: boxNumbers[1]!,
    width: boxNumbers[2]!,
    height: boxNumbers[3]!,
  };
  let nodes = 0;
  let paths = 0;
  let commands = 0;
  let hasStroke = false;
  const slots: EditorVectorSlot[] = [];
  const palette = new Map<string, EditorVectorSlot>();
  function visit(
    element: Element,
    depth: number,
    inherited: { fill: string; stroke: string; color: string }
  ): void {
    const tag = element.localName;
    if (element.namespaceURI !== NS || (tag === 'svg' && depth !== 0)) refuse('unsupported-svg');
    validateAttributes(element, tag);
    if (tag === 'title' || tag === 'desc') {
      if (element.children.length) refuse('unsupported-svg');
      element.remove();
      return;
    }
    if (++nodes > 5000 || depth > 40) refuse('budget-exceeded');
    if (
      Array.from(element.childNodes).some((node) => node.nodeType === 3 && node.textContent?.trim())
    )
      refuse('unsupported-svg');
    const effective = {
      fill: element.getAttribute('fill') ?? inherited.fill,
      stroke: element.getAttribute('stroke') ?? inherited.stroke,
      color: element.getAttribute('color') ?? inherited.color,
    };
    if (effective.color === 'currentColor') effective.color = inherited.color;
    if (effective.color === 'none') refuse('unsupported-svg');
    effective.color = color(effective.color);
    element.setAttribute('id', `v${nodes}`);
    if (tag !== 'svg' && tag !== 'g') {
      if (++paths > 500) refuse('budget-exceeded');
      if (element.children.length) refuse('unsupported-svg');
      if (tag === 'path') commands += validatePath(element.getAttribute('d') ?? '');
      else if (tag === 'polygon' || tag === 'polyline')
        commands += numbers(element.getAttribute('points') ?? '').length / 2;
      else commands++;
      if (commands > 5000) refuse('budget-exceeded');
      element.setAttribute('color', effective.color);
      for (const attribute of ['fill', 'stroke'] as const) {
        const value = effective[attribute];
        if (value === 'none') {
          element.setAttribute(attribute, value);
          continue;
        }
        const kind = value === 'currentColor' ? 'current-color' : 'explicit-color';
        const originalColor = kind === 'current-color' ? effective.color : color(value);
        const key = `${kind}:${originalColor}`;
        let slot = palette.get(key);
        if (!slot) {
          slot = { id: `c${slots.length}`, kind, originalColor, bindings: [] };
          slots.push(slot);
          palette.set(key, slot);
        }
        slot.bindings.push({ nodeId: element.getAttribute('id')!, attribute });
        element.setAttribute(attribute, kind === 'current-color' ? 'currentColor' : originalColor);
        if (attribute === 'stroke') hasStroke = true;
      }
    }
    for (const child of Array.from(element.children)) visit(child, depth + 1, effective);
  }
  visit(root, 0, { fill: '#000000', stroke: 'none', color: '#000000' });
  if (paths === 0) refuse('invalid-svg');
  root.setAttribute('xmlns', NS);
  root.setAttribute('viewBox', boxNumbers.join(' '));
  root.setAttribute('width', viewBox.width.toString());
  root.setAttribute('height', viewBox.height.toString());
  return {
    viewBox,
    svg: canonicalXml(root),
    slots,
    capabilities: { palette: slots.length > 0, strokeScale: hasStroke },
  };
}

function prepareArtwork(svg: string) {
  // Admission precedes sanitization so unsupported artwork cannot become a partial import.
  const admitted = normalizeArtwork(svg);
  const sanitized = sanitizeSvgFragment(admitted.svg, {
    allowedTags: Object.keys(GEOMETRY),
    allowedAttributes: [...COMMON, ...Object.values(GEOMETRY).flat()],
  });
  if (sanitized === null) refuse('unsafe-svg');
  const checked = normalizeArtwork(sanitized);
  if (JSON.stringify(checked) !== JSON.stringify(admitted)) refuse('unsafe-svg');
  return checked;
}

/** Prepare before insertion or persistence. Unsupported features never become partial artwork. */
export async function prepareEditorVectorDefinition(
  svg: string,
  provenance: EditorVectorProvenance
): Promise<EditorVectorDefinition> {
  if (typeof svg !== 'string' || !isEditorVectorProvenance(provenance))
    refuse('invalid-definition');
  const artwork = prepareArtwork(svg);
  const detachedProvenance = { ...provenance };
  const definition: EditorVectorDefinition = {
    version: 1,
    id: await computeEditorVectorDefinitionDigest({
      version: 1,
      ...artwork,
      provenance: detachedProvenance,
    }),
    ...artwork,
    provenance: detachedProvenance,
  };
  Object.freeze(definition.viewBox);
  Object.freeze(definition.provenance);
  Object.freeze(definition.capabilities);
  for (const slot of definition.slots) {
    slot.bindings.forEach(Object.freeze);
    Object.freeze(slot.bindings);
    Object.freeze(slot);
  }
  Object.freeze(definition.slots);
  return Object.freeze(definition);
}

/** Recompute every derived field and the digest at an untrusted storage/document boundary. */
export async function validateEditorVectorDefinition(
  value: unknown
): Promise<EditorVectorDefinition> {
  if (!isEditorVectorDefinition(value)) refuse('invalid-definition');
  const prepared = await prepareEditorVectorDefinition(value.svg, value.provenance);
  if (serializeEditorVectorDefinition(prepared) !== serializeEditorVectorDefinition(value))
    refuse('invalid-definition');
  return prepared;
}
