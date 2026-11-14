import {
  ActiveSelection,
  Canvas,
  Group,
  Line,
  Path,
  Polyline,
  Textbox,
  util,
  type FabricObject,
  type TPointerEvent,
  type Transform,
} from 'fabric';
import { CUSTOM_JSON_PROPS, isEditableObject } from '../model/index';
import { isDrawingQuadStrictlyContained } from '../../../features/drawing/public';

/** Visible bounds of a projected layer in Fabric scene coordinates. */
export type EditorLayerPresentationBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type PresentationBoundsResolver = (
  object: FabricObject
) => EditorLayerPresentationBounds | null | undefined;
const SELECTION_DRAG_THRESHOLD_PX = 3;

/** Owns native selection gestures, group scope, and interrupted transform recovery. */
export class EditorSelectionCanvas extends Canvas {
  private marqueeSelection: { objects: FabricObject[]; scope: Group | null } | null = null;
  private marqueeCancelled = false;
  private transformDraft: { transform: Transform; restore: () => void } | null = null;
  private deferSelectionTarget = false;
  private selectionGesture: {
    target: FabricObject;
    previous: FabricObject[];
    start: ReturnType<typeof util.getPointer>;
    additive: boolean;
    toggle: boolean;
    dragged: boolean;
  } | null = null;

  constructor(...args: ConstructorParameters<typeof Canvas>) {
    super(...args);
    this.on('mouse:down:before', ({ e, target }) => {
      this.marqueeCancelled = false;
      this.marqueeSelection =
        this.selection &&
        !this.skipTargetFind &&
        !this.isDrawingMode &&
        (!('button' in e) || e.button === 0) &&
        (!target || !target.selectable)
          ? { objects: this.getActiveObjects().slice(), scope: this.getSelectionGroupScope() }
          : null;
    });
    this.on('mouse:up', () => {
      this.marqueeSelection = null;
      this.transformDraft = null;
    });
    this.on('before:transform', ({ transform }) => this.captureTransformDraft(transform));
  }

  override __onMouseDown(event: TPointerEvent): void {
    if (!this._isMainEvent(event) || ('button' in event && event.button !== 0)) {
      super.__onMouseDown(event);
      return;
    }
    this.selectionGesture = null;
    const target = this.findTarget(event).target;
    if (
      target &&
      target.visible &&
      target.selectable &&
      !target.sniptaleLocked &&
      this.selection &&
      !this.skipTargetFind &&
      !this.isDrawingMode &&
      !this._currentTransform &&
      target !== this.getActiveObject() &&
      !this.getActiveObjects().includes(target)
    ) {
      this.selectionGesture = {
        target,
        previous: this.getActiveObjects().slice(),
        start: util.getPointer(event),
        additive: event.shiftKey,
        toggle: !event.shiftKey && event.ctrlKey,
        dragged: false,
      };
      // Native selection owns the marquee. Only the hit under its starting point is deferred.
      this.deferSelectionTarget = true;
    }
    try {
      super.__onMouseDown(event);
    } finally {
      this.deferSelectionTarget = false;
    }
  }

  override __onMouseMove(event: TPointerEvent): void {
    if (this._isMainEvent(event)) this.updateSelectionDistance(event);
    super.__onMouseMove(event);
    const transform = this._currentTransform;
    if (
      !transform ||
      !this._isMainEvent(event) ||
      this.isDrawingMode ||
      !this.selection ||
      this.skipTargetFind
    )
      return;
    const { target } = transform;
    const captured = target.controls[transform.corner];
    if (!captured || !(captured.actionName === 'scale' || transform.action?.startsWith('scale')))
      return;
    // Native transform moves do not refresh the cursor. Crossing an anchor swaps
    // the visual resize handle while the native captured control remains fixed.
    const x = captured.x * (target.flipX !== transform.original.flipX ? -1 : 1);
    const y = captured.y * (target.flipY !== transform.original.flipY ? -1 : 1);
    const entry = Object.entries(target.controls).find(
      ([, control]) => control.x === x && control.y === y
    );
    const [key, control] = entry ?? [transform.corner, captured];
    const coordinate = target.calcOCoords()[key];
    if (coordinate) this.setCursor(control.cursorStyleHandler(event, control, target, coordinate));
  }

  override _setCursorFromEvent(event: TPointerEvent, target?: FabricObject): void {
    if (
      !this.selection ||
      this.skipTargetFind ||
      this.isDrawingMode ||
      (target instanceof Textbox && target.isEditing)
    ) {
      super._setCursorFromEvent(event, target);
      return;
    }
    const selected =
      target && (target === this.getActiveObject() || this.getActiveObjects().includes(target));
    if (!selected) {
      this.setCursor(this.defaultCursor);
      return;
    }
    const handle = target.findControl(this.getViewportPoint(event));
    if (handle) {
      this.setCursor(
        handle.control.cursorStyleHandler(event, handle.control, target, handle.coord)
      );
      return;
    }
    this.setCursor('move');
  }

  override __onMouseUp(event: TPointerEvent): void {
    if (!this._isMainEvent(event) || ('button' in event && event.button !== 0)) {
      super.__onMouseUp(event);
      return;
    }
    this.updateSelectionDistance(event);
    const pending = this.selectionGesture;
    const click = pending && !pending.dragged && !this.marqueeCancelled;
    if (click) this._groupSelector = null;
    try {
      // Keep the pending border until native release hands selection to the active object.
      super.__onMouseUp(event);
      if (!click) return;
      const eligible = (object: FabricObject) =>
        this.getSelectionScopeObjects().includes(object) &&
        object.visible &&
        object.selectable &&
        !object.sniptaleLocked;
      if (!eligible(pending.target)) return;
      const previous = pending.previous.filter(eligible);
      const next = pending.additive
        ? [...new Set([...previous, pending.target])]
        : pending.toggle
          ? previous.includes(pending.target)
            ? previous.filter((object) => object !== pending.target)
            : [...previous, pending.target]
          : [pending.target];
      this.discardActiveObject(event);
      if (next.length === 1) this.setActiveObject(next[0]!, event);
      else if (next.length > 1)
        this.setActiveObject(new ActiveSelection(next, { canvas: this }), event);
      this._setCursorFromEvent(event, this.getActiveObject());
      this.requestRenderAll();
    } finally {
      this.selectionGesture = null;
    }
  }

  private updateSelectionDistance(event: TPointerEvent): void {
    const pending = this.selectionGesture;
    if (pending && util.getPointer(event).distanceFrom(pending.start) > SELECTION_DRAG_THRESHOLD_PX)
      pending.dragged = true;
  }

  private captureTransformDraft(transform: Transform): void {
    const objects = new Set<FabricObject>();
    const restore: Array<() => void> = [];
    const capture = (object: FabricObject) => {
      if (objects.has(object)) return;
      objects.add(object);
      const geometry = {
        ...util.saveObjectTransform(object),
        originX: object.originX,
        originY: object.originY,
        width: object.width,
        height: object.height,
        strokeWidth: object.strokeWidth,
      };
      const custom = CUSTOM_JSON_PROPS.map((key) => {
        const value: unknown = object.get(key);
        return { key, value: structuredClone(value) };
      });
      const richShape = structuredClone(object.sniptaleRichShape);
      const path =
        object instanceof Path
          ? { path: structuredClone(object.path), pathOffset: object.pathOffset.clone() }
          : null;
      const points = object instanceof Polyline ? structuredClone(object.points) : null;
      const line =
        object instanceof Line
          ? { x1: object.x1, y1: object.y1, x2: object.x2, y2: object.y2 }
          : null;
      const restoreCustom = () => {
        for (const { key, value } of custom) {
          if (value === undefined) Reflect.deleteProperty(object, key);
          else object.set(key, value);
        }
      };
      restore.push(() => {
        restoreCustom();
        if (richShape === undefined) delete object.sniptaleRichShape;
        else object.sniptaleRichShape = richShape;
        object.set(geometry);
        if (object instanceof Path && path) object.set(path);
        if (object instanceof Polyline && points) object.set({ points });
        if (object instanceof Line && line) object.set(line);
        if (object instanceof Textbox) {
          // The text adapter detects a width change before it reads the accepted wrapping mode.
          object.initDimensions();
          restoreCustom();
          object.initDimensions();
          object.set({ width: geometry.width, height: geometry.height });
          restoreCustom();
        }
        object.dirty = true;
      });
      if (object instanceof Group) object.getObjects().forEach(capture);
    };
    const selected =
      transform.target instanceof ActiveSelection
        ? transform.target.getObjects()
        : [transform.target];
    for (const member of selected) {
      let root: FabricObject = member;
      while (root.parent) root = root.parent;
      capture(root);
    }
    capture(transform.target);
    this.transformDraft = {
      transform,
      restore: () => {
        restore.forEach((apply) => apply());
        objects.forEach((object) => object.setCoords());
      },
    };
  }

  /** Restores an interrupted native transform without publishing a document modification. */
  cancelCurrentTransform(): boolean {
    const transform = this._currentTransform;
    if (!transform) return false;
    if (this.transformDraft?.transform === transform) this.transformDraft.restore();
    else {
      const { left, top, scaleX, scaleY, skewX, skewY, angle, flipX, flipY } = transform.original;
      transform.target.set({
        left,
        top,
        scaleX,
        scaleY,
        skewX,
        skewY,
        angle,
        flipX,
        flipY,
        width: transform.width,
        height: transform.height,
      });
      transform.target.setCoords();
    }
    transform.actionPerformed = false;
    transform.target.isMoving = false;
    transform.target._scaling = false;
    this._currentTransform = null;
    this.transformDraft = null;
    delete this._objectsToRender;
    this.setCursor(this.defaultCursor);
    this.requestRenderAll();
    return true;
  }

  /** Restores the accepted selection before leaving a group or cancelling another operation. */
  cancelSelectionMarquee(): boolean {
    this.selectionGesture = null;
    if (!this._groupSelector) return false;
    const previous = this.marqueeSelection;
    this._groupSelector = null;
    this.marqueeSelection = null;
    this.marqueeCancelled = true;
    this.clearContext(this.contextTop);
    this.discardActiveObject();
    if (previous) {
      this.selectionGroupScope = previous.scope;
      const siblings = this.getSelectionScopeObjects();
      const objects = previous.objects.filter((object) => siblings.includes(object));
      if (objects.length === 1) this.setActiveObject(objects[0]!);
      else if (objects.length > 1)
        this.setActiveObject(new ActiveSelection(objects, { canvas: this }));
    }
    this.requestRenderAll();
    return true;
  }

  /** Prevents modifier completion from reapplying an already cancelled marquee. */
  isSelectionMarqueeCancelled(): boolean {
    return this.marqueeCancelled;
  }

  override dispose(): ReturnType<Canvas['dispose']> {
    this.selectionGesture = null;
    this.marqueeSelection = null;
    this.transformDraft = null;
    this.selectionGroupScope = null;
    return super.dispose();
  }

  private layerSelectionPriority: FabricObject | null = null;
  private tracksLayerSelectionPriority = false;

  private selectionGroupScope: Group | null = null;
  private tracksSelectionGroupScope = false;

  /** Returns the entered group while it belongs to the live, editable document. */
  getSelectionGroupScope(): Group | null {
    const scope = this.selectionGroupScope;
    if (!scope) return null;
    let current: FabricObject = scope;
    while (true) {
      if (!current.visible || current.sniptaleLocked) {
        this.selectionGroupScope = null;
        return null;
      }
      const parent = current.parent;
      if (!parent) break;
      if (!parent.getObjects().includes(current)) {
        this.selectionGroupScope = null;
        return null;
      }
      current = parent;
    }
    if (!this.getObjects().includes(current)) this.selectionGroupScope = null;
    // Native groups refresh child hit coordinates only when subTargetCheck is persisted.
    this.selectionGroupScope?.getObjects().forEach((object) => object.setCoords());
    return this.selectionGroupScope;
  }

  /** Enters one sibling collection without changing serialized group interaction flags. */
  enterSelectionGroup(group: Group, event?: TPointerEvent): boolean {
    if (group.sniptaleType !== 'group') return false;
    const previous = this.selectionGroupScope;
    this.selectionGroupScope = group;
    if (!this.getSelectionGroupScope()) {
      this.selectionGroupScope = previous;
      return false;
    }
    if (!this.tracksSelectionGroupScope) {
      const followSelection = () => {
        const members = this.getActiveObjects();
        const parent = members[0]?.parent ?? null;
        if (members.length && members.every((object) => (object.parent ?? null) === parent)) {
          this.selectionGroupScope = parent;
        }
      };
      this.on('selection:created', followSelection);
      this.on('selection:updated', followSelection);
      this.tracksSelectionGroupScope = true;
    }
    this.discardActiveObject();
    if (event) {
      const hit = this.searchPossibleTargets(group.getObjects(), this.getScenePoint(event)).target;
      if (hit && hit.visible && hit.selectable && !hit.sniptaleLocked)
        this.setActiveObject(hit, event);
    }
    this.requestRenderAll();
    return true;
  }

  /** Selects the containing group and leaves exactly one entered level. */
  exitSelectionGroup(): boolean {
    const group = this.getSelectionGroupScope();
    if (!group) return false;
    this.discardActiveObject();
    this.selectionGroupScope = group.parent ?? null;
    this.setActiveObject(group);
    this.requestRenderAll();
    return true;
  }

  /** Lists the siblings available to pointer and marquee selection. */
  getSelectionScopeObjects(): FabricObject[] {
    return this.getSelectionGroupScope()?.getObjects() ?? this.getObjects();
  }

  setLayerSelectionPriority(object: FabricObject | null): void {
    if (!this.tracksLayerSelectionPriority) {
      const clearPriority = () => {
        this.layerSelectionPriority = null;
      };
      this.on('selection:created', clearPriority);
      this.on('selection:updated', clearPriority);
      this.on('selection:cleared', clearPriority);
      this.tracksLayerSelectionPriority = true;
    }
    this.layerSelectionPriority = object;
  }

  override findTarget(e: TPointerEvent): ReturnType<Canvas['findTarget']> {
    if (this.deferSelectionTarget) return { subTargets: [], currentSubTargets: [] };
    const priority = this.layerSelectionPriority;
    if (priority && this.getActiveObject() !== priority) this.layerSelectionPriority = null;
    const preserveObjectStacking = this.preserveObjectStacking;
    if (this.layerSelectionPriority) this.preserveObjectStacking = false;
    let native: ReturnType<Canvas['findTarget']>;
    try {
      native = super.findTarget(e);
    } finally {
      this.preserveObjectStacking = preserveObjectStacking;
    }
    const scope = this.getSelectionGroupScope();
    if (!scope || this.skipTargetFind || this._currentTransform || this._targetInfo) return native;
    const active = this.getActiveObject();
    if (active?.findControl(this.getViewportPoint(e), util.isTouchEvent(e))) return native;
    if (
      native.target === active &&
      (active instanceof ActiveSelection || this.layerSelectionPriority === active)
    )
      return native;
    const scoped = this.searchPossibleTargets(scope.getObjects(), this.getScenePoint(e));
    const target = scoped.target;
    if (!target || target.sniptaleLocked || !target.selectable) {
      // Empty space inside the entered group belongs to its marquee, not to its parent.
      if (this._checkTarget(scope, this.getScenePoint(e))) {
        return { subTargets: [], currentSubTargets: [] };
      }
      return native;
    }
    return {
      ...scoped,
      currentTarget: target,
      ...(scoped.container ? { currentContainer: scoped.container } : {}),
      currentSubTargets: scoped.subTargets,
    };
  }

  override searchPossibleTargets(
    ...args: Parameters<Canvas['searchPossibleTargets']>
  ): ReturnType<Canvas['searchPossibleTargets']> {
    const [objects, pointer] = args;
    if (!this.selection || this.skipTargetFind || this.isDrawingMode || this._currentTransform)
      return super.searchPossibleTargets(...args);
    const hits = objects.toReversed().flatMap((object) => {
      if (!object.visible || !object.evented || !object.selectable || object.sniptaleLocked)
        return [];
      const hit = super.searchPossibleTargets([object], pointer);
      return hit.target ? [{ hit, quad: object.getCoords() }] : [];
    });
    return (
      hits.find(
        (candidate, index) =>
          !hits.some(
            (lower, lowerIndex) =>
              lowerIndex > index && isDrawingQuadStrictlyContained(lower.quad, candidate.quad)
          )
      )?.hit ?? { subTargets: [] }
    );
  }

  private presentationBounds: PresentationBoundsResolver | null = null;

  /** Undefined retains native bounds; null excludes a projected layer until its surface exists. */
  setLayerPresentationBoundsResolver(resolve: PresentationBoundsResolver | null): void {
    this.presentationBounds = resolve;
  }

  /** Returns presentation bounds for a projected layer, without changing document geometry. */
  getLayerPresentationBounds(
    object: FabricObject
  ): EditorLayerPresentationBounds | null | undefined {
    return this.presentationBounds?.(object);
  }

  override collectObjects(
    ...args: Parameters<Canvas['collectObjects']>
  ): ReturnType<Canvas['collectObjects']> {
    const native =
      this.getSelectionGroupScope()?.collectObjects(...args) ?? super.collectObjects(...args);
    if (!this.presentationBounds) return native;
    const [rect, options] = args;
    const includeIntersecting = options?.includeIntersecting ?? true;
    const nativeObjects = new Set(native);
    return this.getSelectionScopeObjects()
      .toReversed()
      .filter((object) => {
        const bounds = this.presentationBounds?.(object);
        if (bounds === undefined) return nativeObjects.has(object);
        if (bounds === null || !object.visible || !object.selectable) return false;
        if (includeIntersecting)
          return (
            bounds.left <= rect.left + rect.width &&
            bounds.left + bounds.width >= rect.left &&
            bounds.top <= rect.top + rect.height &&
            bounds.top + bounds.height >= rect.top
          );
        return (
          bounds.left >= rect.left &&
          bounds.top >= rect.top &&
          bounds.left + bounds.width <= rect.left + rect.width &&
          bounds.top + bounds.height <= rect.top + rect.height
        );
      });
  }

  /** Reads the current cursor or fully-contained marquee candidates without changing selection. */
  getSelectionPreviewObjects(hoverTarget?: FabricObject): FabricObject[] {
    if (!this.selection || this.skipTargetFind || this.isDrawingMode || this._currentTransform)
      return [];
    const marquee = this._groupSelector;
    const eligible = (object: FabricObject) =>
      object.visible &&
      object.selectable &&
      object.sniptaleLocked !== true &&
      isEditableObject(object);
    const pending = this.selectionGesture;
    if (
      pending &&
      !pending.dragged &&
      eligible(pending.target) &&
      this.getSelectionScopeObjects().includes(pending.target) &&
      !this.getActiveObjects().includes(pending.target)
    )
      return [pending.target];
    if (marquee) {
      if (marquee.deltaX === 0 && marquee.deltaY === 0) return [];
      const candidates = new Set(
        this.collectObjects(
          {
            left: marquee.x + Math.min(0, marquee.deltaX),
            top: marquee.y + Math.min(0, marquee.deltaY),
            width: Math.abs(marquee.deltaX),
            height: Math.abs(marquee.deltaY),
          },
          { includeIntersecting: false }
        )
      );
      return this.getSelectionScopeObjects()
        .toReversed()
        .filter((object) => candidates.has(object) && eligible(object));
    }
    const liveHover = (object: FabricObject): boolean => {
      let current = object;
      while (current.parent) {
        if (
          !current.parent.visible ||
          current.parent.sniptaleLocked ||
          !current.parent.getObjects().includes(current)
        )
          return false;
        current = current.parent;
      }
      return this.getObjects().includes(current);
    };
    return hoverTarget &&
      eligible(hoverTarget) &&
      liveHover(hoverTarget) &&
      !this.getActiveObjects().includes(hoverTarget)
      ? [hoverTarget]
      : [];
  }
}
