import {
  Color,
  type FabricObject,
  FixedLayout,
  Group,
  LayoutManager,
  Rect,
  loadSVGFromString,
} from 'fabric';
import {
  isEditorVectorInstance,
  type EditorVectorDefinition,
  type EditorVectorInstance,
} from '../../../features/editor/document/vector-element';
import { EditorVectorValidationError, validateEditorVectorDefinition } from './prepare';

interface Binding {
  object: FabricObject;
  attribute: 'fill' | 'stroke';
  slotId: string;
  originalColor: string;
  paintOpacity: number;
}

interface Projection {
  definition: EditorVectorDefinition;
  bindings: Binding[];
  strokes: { object: FabricObject; width: number }[];
  groups: Group[];
  opacityBeforePreview: number | null;
  previewInstance: EditorVectorInstance | null;
}

const projections = new WeakMap<Group, Projection>();

function preserveGroupCompositing(group: Group): void {
  // Fabric normally skips nested caches. SVG opacity requires an isolated surface even inside a cache.
  group.needsItsOwnCache = () =>
    group.opacity !== 1 || Group.prototype.needsItsOwnCache.call(group);
}

function copyInstance(instance: EditorVectorInstance): EditorVectorInstance {
  return {
    version: 1,
    definitionId: instance.definitionId,
    overrides: {
      colors: { ...instance.overrides.colors },
      strokeScale: instance.overrides.strokeScale,
    },
  };
}

function checkInstance(
  definition: EditorVectorDefinition,
  instance: unknown
): asserts instance is EditorVectorInstance {
  if (
    !isEditorVectorInstance(instance) ||
    instance.definitionId !== definition.id ||
    Object.keys(instance.overrides.colors).some(
      (id) => !definition.slots.some((slot) => slot.id === id)
    ) ||
    (!definition.capabilities.strokeScale && instance.overrides.strokeScale !== 1)
  )
    throw new EditorVectorValidationError('invalid-definition');
}

function sourceLeaves(root: Element): Element[] {
  return Array.from(root.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline'));
}

function inheritedNumber(element: Element, attribute: string): number {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const value = node.getAttribute(attribute);
    if (value !== null) return Number(value);
  }
  return 1;
}

function cacheProjection(
  group: Group,
  definition: EditorVectorDefinition,
  objects: Map<string, FabricObject>,
  source: Element,
  groups: Group[]
): void {
  const sourceById = new Map(
    sourceLeaves(source).map((element) => [element.getAttribute('id'), element])
  );
  const bindings: Binding[] = [];
  for (const slot of definition.slots) {
    for (const binding of slot.bindings) {
      const object = objects.get(binding.nodeId);
      const element = sourceById.get(binding.nodeId);
      if (!object || !element) throw new EditorVectorValidationError('invalid-definition');
      bindings.push({
        object,
        attribute: binding.attribute,
        slotId: slot.id,
        originalColor: slot.originalColor,
        paintOpacity: inheritedNumber(element, `${binding.attribute}-opacity`),
      });
    }
  }
  projections.set(group, {
    definition,
    bindings,
    groups,
    opacityBeforePreview: null,
    previewInstance: null,
    strokes: Array.from(objects.values(), (object) => ({ object, width: object.strokeWidth })),
  });
}

/** Project validated artwork as actual vector primitives with isolated group compositing. */
export async function createEditorVectorRuntime(
  definitionValue: unknown,
  instanceValue: unknown
): Promise<Group> {
  const definition = await validateEditorVectorDefinition(definitionValue);
  checkInstance(definition, instanceValue);
  const source = new DOMParser().parseFromString(definition.svg, 'image/svg+xml').documentElement;
  const parseDocument = new DOMParser().parseFromString(definition.svg, 'image/svg+xml');
  for (const element of sourceLeaves(parseDocument.documentElement)) {
    for (const attribute of ['fill', 'stroke']) {
      if (element.getAttribute(attribute) === 'currentColor')
        element.setAttribute(attribute, element.getAttribute('color') ?? '#000000');
    }
  }
  const objects = new Map<string, FabricObject>();
  await loadSVGFromString(
    new XMLSerializer().serializeToString(parseDocument),
    (element, object) => {
      const id = element.getAttribute('id');
      if (id) objects.set(id, object);
      // Fabric multiplies ancestor opacity into every leaf. Each reconstructed group owns it instead.
      object.set({
        opacity: Number(element.getAttribute('opacity') ?? 1),
        strokeWidth: object.stroke ? object.strokeWidth : 0,
        selectable: false,
        evented: false,
      });
      const bounds = object.getBoundingRect();
      if (
        Object.values(bounds).some((value) => !Number.isFinite(value) || Math.abs(value) > 131072)
      )
        throw new EditorVectorValidationError('budget-exceeded');
    }
  );
  if (objects.size !== sourceLeaves(source).length)
    throw new EditorVectorValidationError('unsupported-svg');
  const groups: Group[] = [];
  function build(element: Element): FabricObject {
    if (element.localName !== 'g' && element.localName !== 'svg') {
      const object = objects.get(element.getAttribute('id') ?? '');
      if (!object) throw new EditorVectorValidationError('unsupported-svg');
      return object;
    }
    const group = new Group(Array.from(element.children, build), {
      opacity: Number(element.getAttribute('opacity') ?? 1),
      objectCaching: true,
      selectable: false,
      evented: false,
    });
    preserveGroupCompositing(group);
    groups.push(group);
    return group;
  }
  const artwork = build(source);
  const { width, height } = definition.viewBox;
  const root = new Group([], {
    originX: 'left',
    originY: 'top',
    left: 0,
    top: 0,
    width,
    height,
    strokeWidth: 0,
    layoutManager: new LayoutManager(new FixedLayout()),
    objectCaching: true,
  });
  root.add(artwork);
  for (const object of objects.values()) object.setCoords();
  for (const group of groups) group.setCoords();
  root.setCoords();
  // The SVG viewport clips overflow while its original padding remains part of the object bounds.
  root.clipPath = new Rect({
    originX: 'center',
    originY: 'center',
    left: 0,
    top: 0,
    width,
    height,
    strokeWidth: 0,
    fill: '#000000',
  });
  root.sniptaleType = 'vector-element';
  root.sniptaleRole = 'annotation';
  cacheProjection(root, definition, objects, source, [...groups, root]);
  updateEditorVectorRuntime(root, instanceValue);
  return root;
}

/** Palette previews touch cached paint bindings only; source parsing and geometry stay unchanged. */
export function previewEditorVectorRuntime(group: Group, instance: EditorVectorInstance): void {
  const projection = projections.get(group);
  if (!projection) throw new EditorVectorValidationError('invalid-definition');
  checkInstance(projection.definition, instance);
  applyProjectionStyle(projection, instance);
  const accepted = group.sniptaleVectorElement;
  const colors = instance.overrides.colors;
  projection.previewInstance =
    accepted &&
    accepted.definitionId === instance.definitionId &&
    accepted.overrides.strokeScale === instance.overrides.strokeScale &&
    Object.keys(accepted.overrides.colors).length === Object.keys(colors).length &&
    Object.entries(colors).every(([id, value]) => accepted.overrides.colors[id] === value)
      ? null
      : copyInstance(instance);
}

function applyProjectionStyle(projection: Projection, instance: EditorVectorInstance): void {
  for (const binding of projection.bindings) {
    const paint = new Color(instance.overrides.colors[binding.slotId] ?? binding.originalColor);
    paint.setAlpha(paint.getAlpha() * binding.paintOpacity);
    binding.object.set(binding.attribute, paint.toRgba());
  }
  for (const stroke of projection.strokes)
    stroke.object.set('strokeWidth', stroke.width * instance.overrides.strokeScale);
  for (const current of projection.groups) current.set('dirty', true);
}

/** Commit accepted styling after preview confirmation; consumers persist only this metadata. */
export function updateEditorVectorRuntime(group: Group, instance: EditorVectorInstance): void {
  previewEditorVectorRuntime(group, instance);
  group.sniptaleVectorElement = copyInstance(instance);
  projections.get(group)!.previewInstance = null;
}

/** Render a draft root opacity while retaining the accepted value for document capture. */
export function previewEditorVectorOpacity(group: Group, value: number): void {
  const projection = projections.get(group);
  if (!projection || !Number.isFinite(value) || value < 0 || value > 1)
    throw new EditorVectorValidationError('invalid-definition');
  if (projection.opacityBeforePreview === null) projection.opacityBeforePreview = group.opacity;
  group.set('opacity', value);
}

/** Document serializers read accepted opacity even while the canvas shows a draft. */
export function getEditorVectorAcceptedOpacity(group: Group): number {
  return projections.get(group)?.opacityBeforePreview ?? group.opacity;
}

/** Accept the current draft opacity without changing vector palette metadata. */
export function commitEditorVectorOpacity(group: Group): void {
  const projection = projections.get(group);
  if (!projection) throw new EditorVectorValidationError('invalid-definition');
  projection.opacityBeforePreview = null;
}

/** Restore the opacity from before the first draft, including an accepted zero value. */
export function cancelEditorVectorOpacity(group: Group): void {
  const projection = projections.get(group);
  if (!projection) throw new EditorVectorValidationError('invalid-definition');
  if (projection.opacityBeforePreview !== null)
    group.set('opacity', projection.opacityBeforePreview);
  projection.opacityBeforePreview = null;
}

/** Draw accepted vector styles synchronously, then restore every live draft before returning. */
export function withEditorVectorAcceptedRendering<T>(
  objects: readonly FabricObject[],
  draw: () => T
): T {
  const restore: Array<() => void> = [];
  function visit(object: FabricObject): void {
    if (!(object instanceof Group)) return;
    const projection = projections.get(object);
    if (
      projection &&
      (projection.previewInstance !== null || projection.opacityBeforePreview !== null)
    ) {
      const preview = projection.previewInstance;
      const opacity = object.opacity;
      restore.push(() => {
        if (preview) applyProjectionStyle(projection, preview);
        object.set('opacity', opacity);
      });
      if (preview) {
        const accepted = object.sniptaleVectorElement;
        checkInstance(projection.definition, accepted);
        applyProjectionStyle(projection, accepted);
      }
      object.set('opacity', projection.opacityBeforePreview ?? opacity);
    }
    if (!projection) object.getObjects().forEach(visit);
  }
  try {
    objects.forEach(visit);
    return draw();
  } finally {
    for (let index = restore.length - 1; index >= 0; index--) restore[index]!();
  }
}

/** Return the detached validated resource associated with a live projection. */
export function getEditorVectorDefinition(group: Group): EditorVectorDefinition | undefined {
  return projections.get(group)?.definition;
}

/** Rebind a Fabric clone using deterministic leaf order, without parsing geometry again. */
export async function adoptEditorVectorRuntime(
  group: Group,
  definitionValue: unknown,
  instance: EditorVectorInstance
): Promise<void> {
  const definition = await validateEditorVectorDefinition(definitionValue);
  checkInstance(definition, instance);
  const source = new DOMParser().parseFromString(definition.svg, 'image/svg+xml').documentElement;
  const leaves: FabricObject[] = [];
  const groups: Group[] = [];
  function visit(object: FabricObject): void {
    if (object instanceof Group) {
      preserveGroupCompositing(object);
      groups.push(object);
      object.getObjects().forEach(visit);
    } else leaves.push(object);
  }
  visit(group);
  const elements = sourceLeaves(source);
  if (leaves.length !== elements.length)
    throw new EditorVectorValidationError('invalid-definition');
  const objects = new Map<string, FabricObject>();
  elements.forEach((element, index) => {
    const object = leaves[index]!;
    // A clone can contain draft widths. The validated SVG retains authoritative source widths.
    object.set(
      'strokeWidth',
      element.getAttribute('stroke') === 'none' ? 0 : inheritedNumber(element, 'stroke-width')
    );
    objects.set(element.getAttribute('id')!, object);
  });
  cacheProjection(group, definition, objects, source, groups);
  updateEditorVectorRuntime(group, instance);
}
