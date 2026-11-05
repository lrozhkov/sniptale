import {
  createDefaultDrawingToolDefaults,
  type DrawingDocument,
  type DrawingObject,
  type DrawingTool,
  type DrawingToolDefaults,
} from './model';
import { createDrawingId } from './create';
import { translateDrawingObject } from './geometry';

export interface DrawingSessionSnapshot {
  readonly document: DrawingDocument;
  readonly activeTool: DrawingTool;
  readonly selectedObjectIds: readonly string[];
  readonly selectedObjectId: string | null;
  readonly defaults: DrawingToolDefaults;
  readonly revision: number;
}

export interface DrawingDocumentCommit {
  readonly after: DrawingDocument;
  readonly before: DrawingDocument;
  replay(document: DrawingDocument): boolean;
}

export interface DrawingSession {
  getSnapshot(): DrawingSessionSnapshot;
  /** Reads accepted geometry in the current layout without including an in-progress preview. */
  getCommittedDocument(): DrawingDocument;
  /** Replays an admitted recovery version without creating a second history entry. */
  restoreDocument(document: DrawingDocument): boolean;
  subscribe(listener: () => void): () => void;
  setActiveTool(tool: DrawingTool): void;
  setDefaults(defaults: DrawingToolDefaults): void;
  select(objectId: string | null): void;
  setSelection(objectIds: readonly string[]): void;
  toggleSelection(objectId: string): void;
  commitObject(object: DrawingObject, options?: { select?: boolean }): void;
  /** Appends a prepared batch atomically; invalid or colliding identities refuse the whole batch. */
  commitObjects(objects: readonly DrawingObject[], options?: { select?: boolean }): void;
  replaceObject(object: DrawingObject): void;
  replaceObjects(objects: readonly DrawingObject[]): void;
  /** Show temporary object changes without publishing a document commit. */
  previewObjects(objects: readonly DrawingObject[]): void;
  /** Restore the committed document after a temporary object preview. */
  clearObjectPreview(): void;
  deleteObjects(objectIds: readonly string[]): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  moveSelected(direction: 'front' | 'forward' | 'backward' | 'back'): void;
  clear(): void;
  dispose(): void;
}

function documentForObjects(objects: readonly DrawingObject[]): DrawingDocument {
  if (objects.some((object) => object.kind === 'simplify')) return { version: 2, objects };
  return { version: 1, objects: objects.filter((object) => object.kind !== 'simplify') };
}

const EMPTY_DOCUMENT: DrawingDocument = { version: 1, objects: [] };

/** Optional runtime layout projection; canonical versions remain owned by the document/history. */
export interface DrawingObjectProjection {
  capture(object: DrawingObject, previous?: DrawingObject): void;
  resolve(object: DrawingObject): DrawingObject;
}

type DrawingSessionOptions = {
  autoSelectCreatedObjects?: boolean;
  objectProjection?: DrawingObjectProjection;
  initialDocument?: DrawingDocument;
  defaults?: DrawingToolDefaults;
  onDocumentCommit: (commit: DrawingDocumentCommit) => boolean;
  onDispose?: () => void;
};

function reorderedDrawingObjects(
  source: readonly DrawingObject[],
  selected: ReadonlySet<string>,
  direction: 'front' | 'forward' | 'backward' | 'back'
): DrawingObject[] {
  const objects = [...source];
  if (direction === 'front' || direction === 'back') {
    const chosen = objects.filter((object) => selected.has(object.id));
    const rest = objects.filter((object) => !selected.has(object.id));
    return direction === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
  }
  const step = direction === 'forward' ? 1 : -1;
  const start = step === 1 ? objects.length - 2 : 1;
  const end = step === 1 ? -1 : objects.length;
  for (let index = start; index !== end; index -= step) {
    if (selected.has(objects[index]!.id) && !selected.has(objects[index + step]!.id)) {
      [objects[index], objects[index + step]] = [objects[index + step]!, objects[index]!];
    }
  }
  return objects;
}

class DrawingSessionOwner implements DrawingSession {
  private document: DrawingDocument;
  private previewDocument: DrawingDocument | null = null;
  private activeTool: DrawingTool = 'pencil';
  private selectedObjectIds: readonly string[] = [];
  private defaults: DrawingToolDefaults;
  private revision = 0;
  private disposed = false;
  private commitInProgress = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: DrawingSessionOptions) {
    this.document = options.initialDocument ?? EMPTY_DOCUMENT;
    this.document.objects.forEach((object) => options.objectProjection?.capture(object));
    this.defaults = options.defaults ?? createDefaultDrawingToolDefaults();
  }

  private emit() {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  private normalizeSelection(ids: readonly string[], source = this.document) {
    const available = new Set(source.objects.map((object) => object.id));
    return [...new Set(ids)].filter((id) => available.has(id));
  }

  private applyDocument(next: DrawingDocument, nextSelectedIds: readonly string[]) {
    this.document = next;
    this.selectedObjectIds = this.normalizeSelection(nextSelectedIds, next);
    this.emit();
  }

  private replayDocument = (next: DrawingDocument) => {
    if (this.disposed) return false;
    const hadPreview = this.previewDocument !== null;
    this.previewDocument = null;
    if (next !== this.document) this.applyDocument(next, []);
    else if (hadPreview) this.emit();
    return true;
  };

  private captureObjects(objects: readonly DrawingObject[]) {
    const projection = this.options.objectProjection;
    if (!projection) return;
    const previous = new Map(this.document.objects.map((object) => [object.id, object]));
    for (const object of objects) projection.capture(object, previous.get(object.id));
  }

  private commitDocument(next: DrawingDocument, nextSelectedIds = this.selectedObjectIds) {
    if (next === this.document || this.disposed || this.commitInProgress) return;
    const hadPreview = this.previewDocument !== null;
    this.previewDocument = null;
    this.captureObjects(next.objects);
    const before = this.document;
    const beforeSelectedIds = this.selectedObjectIds;
    const revisionBeforeCommit = this.revision;
    this.document = next;
    this.selectedObjectIds = this.normalizeSelection(nextSelectedIds, next);
    this.commitInProgress = true;
    let accepted: boolean | undefined;
    try {
      accepted = this.options.onDocumentCommit({
        after: next,
        before,
        replay: this.replayDocument,
      });
    } catch (error) {
      this.document = before;
      this.selectedObjectIds = beforeSelectedIds;
      if (hadPreview) this.emit();
      throw error;
    } finally {
      this.commitInProgress = false;
    }
    if (accepted !== true) {
      this.document = before;
      this.selectedObjectIds = beforeSelectedIds;
      if (hadPreview) this.emit();
      return;
    }
    if (this.revision === revisionBeforeCommit) this.emit();
  }

  restoreDocument(document: DrawingDocument): boolean {
    if (this.disposed) return false;
    this.captureObjects(document.objects);
    return this.replayDocument(document);
  }

  private projectDocument(source: DrawingDocument): DrawingDocument {
    const objects = this.options.objectProjection
      ? source.objects.map((object) => this.options.objectProjection!.resolve(object))
      : source.objects;
    return objects.every((object, index) => object === source.objects[index])
      ? source
      : documentForObjects(objects);
  }

  getCommittedDocument(): DrawingDocument {
    return this.projectDocument(this.document);
  }

  getSnapshot(): DrawingSessionSnapshot {
    return {
      document: this.projectDocument(this.previewDocument ?? this.document),
      activeTool: this.activeTool,
      selectedObjectIds: this.selectedObjectIds,
      selectedObjectId: this.selectedObjectIds.at(-1) ?? null,
      defaults: this.defaults,
      revision: this.revision,
    };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setActiveTool(tool: DrawingTool) {
    if (this.activeTool === tool) return;
    this.previewDocument = null;
    this.activeTool = tool;
    if (tool !== 'select') this.selectedObjectIds = [];
    this.emit();
  }

  setDefaults(next: DrawingToolDefaults) {
    if (next === this.defaults) return;
    this.defaults = next;
    this.emit();
  }

  select(id: string | null) {
    this.setSelection(id ? [id] : []);
  }

  setSelection(ids: readonly string[]) {
    const next = this.normalizeSelection(ids);
    if (
      this.selectedObjectIds.length === next.length &&
      this.selectedObjectIds.every((selectedId, index) => selectedId === next[index])
    )
      return;
    this.previewDocument = null;
    this.selectedObjectIds = next;
    this.emit();
  }

  toggleSelection(id: string) {
    if (!this.document.objects.some((object) => object.id === id)) return;
    this.setSelection(
      this.selectedObjectIds.includes(id)
        ? this.selectedObjectIds.filter((selectedId) => selectedId !== id)
        : [...this.selectedObjectIds, id]
    );
  }

  commitObject(object: DrawingObject, commitOptions?: { select?: boolean }) {
    this.commitDocument(
      documentForObjects([...this.document.objects, object]),
      this.options.autoSelectCreatedObjects === false || commitOptions?.select === false
        ? []
        : [object.id]
    );
  }

  commitObjects(objects: readonly DrawingObject[], commitOptions?: { select?: boolean }) {
    if (objects.length === 0) return;
    const identities = new Set(this.document.objects.map((object) => object.id));
    for (const object of objects) {
      if (
        typeof object.id !== 'string' ||
        object.id.length === 0 ||
        object.id.length > 256 ||
        identities.has(object.id)
      )
        return;
      identities.add(object.id);
    }
    this.commitDocument(
      documentForObjects([...this.document.objects, ...objects]),
      this.options.autoSelectCreatedObjects === false || commitOptions?.select === false
        ? []
        : objects.map((object) => object.id)
    );
  }

  replaceObject(object: DrawingObject) {
    const index = this.document.objects.findIndex((candidate) => candidate.id === object.id);
    if (index < 0 || this.document.objects[index] === object) return;
    const objects = [...this.document.objects];
    objects[index] = object;
    this.commitDocument(documentForObjects(objects));
  }

  replaceObjects(replacements: readonly DrawingObject[]) {
    if (replacements.length === 0) return;
    const byId = new Map(replacements.map((object) => [object.id, object]));
    let changed = false;
    const objects = this.document.objects.map((object) => {
      const replacement = byId.get(object.id);
      if (!replacement || replacement === object) return object;
      changed = true;
      return replacement;
    });
    if (changed) this.commitDocument(documentForObjects(objects));
  }

  previewObjects(replacements: readonly DrawingObject[]) {
    if (this.disposed || replacements.length === 0) return;
    this.captureObjects(replacements);
    const byId = new Map(replacements.map((object) => [object.id, object]));
    const objects = this.document.objects.map((object) => byId.get(object.id) ?? object);
    if (objects.every((object, index) => object === this.document.objects[index])) return;
    this.previewDocument = documentForObjects(objects);
    this.emit();
  }

  clearObjectPreview() {
    if (!this.previewDocument) return;
    this.previewDocument = null;
    this.emit();
  }

  deleteSelected() {
    this.deleteObjects(this.selectedObjectIds);
  }

  duplicateSelected() {
    if (this.selectedObjectIds.length === 0) return;
    const selected = new Set(this.selectedObjectIds);
    const copies = this.getSnapshot()
      .document.objects.filter((object) => selected.has(object.id))
      .map((object) => ({
        ...translateDrawingObject(object, { x: 12, y: 12 }),
        id: createDrawingId(),
      }));
    if (copies.length === 0) return;
    this.commitDocument(
      documentForObjects([...this.document.objects, ...copies]),
      copies.map((object) => object.id)
    );
  }

  moveSelected(direction: 'front' | 'forward' | 'backward' | 'back') {
    if (this.selectedObjectIds.length === 0) return;
    const objects = reorderedDrawingObjects(
      this.document.objects,
      new Set(this.selectedObjectIds),
      direction
    );
    if (objects.every((object, index) => object === this.document.objects[index])) return;
    this.commitDocument(documentForObjects(objects));
  }

  deleteObjects(objectIds: readonly string[]) {
    if (objectIds.length === 0) return;
    const deleted = new Set(objectIds);
    const objects = this.document.objects.filter((object) => !deleted.has(object.id));
    if (objects.length !== this.document.objects.length) {
      this.commitDocument(
        documentForObjects(objects),
        this.selectedObjectIds.filter((selectedId) => !deleted.has(selectedId))
      );
    }
  }

  clear() {
    if (this.document.objects.length > 0) this.commitDocument(EMPTY_DOCUMENT, []);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.options.onDispose?.();
    this.listeners.clear();
    this.document = EMPTY_DOCUMENT;
    this.previewDocument = null;
    this.selectedObjectIds = [];
  }
}

export function createDrawingSession(options: DrawingSessionOptions): DrawingSession {
  return new DrawingSessionOwner(options);
}
