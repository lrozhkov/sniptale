import {
  createDefaultDrawingToolDefaults,
  type DrawingDocumentV1,
  type DrawingObject,
  type DrawingTool,
  type DrawingToolDefaults,
} from './model';
import { createDrawingId } from './create';
import { translateDrawingObject } from './geometry';

export interface DrawingSessionSnapshot {
  readonly document: DrawingDocumentV1;
  readonly activeTool: DrawingTool;
  readonly selectedObjectIds: readonly string[];
  readonly selectedObjectId: string | null;
  readonly defaults: DrawingToolDefaults;
  readonly revision: number;
}

export interface DrawingDocumentCommit {
  readonly after: DrawingDocumentV1;
  readonly before: DrawingDocumentV1;
  replay(document: DrawingDocumentV1): boolean;
}

export interface DrawingSession {
  getSnapshot(): DrawingSessionSnapshot;
  subscribe(listener: () => void): () => void;
  setActiveTool(tool: DrawingTool): void;
  setDefaults(defaults: DrawingToolDefaults): void;
  select(objectId: string | null): void;
  setSelection(objectIds: readonly string[]): void;
  toggleSelection(objectId: string): void;
  commitObject(object: DrawingObject, options?: { select?: boolean }): void;
  replaceObject(object: DrawingObject): void;
  replaceObjects(objects: readonly DrawingObject[]): void;
  deleteObjects(objectIds: readonly string[]): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  moveSelected(direction: 'front' | 'forward' | 'backward' | 'back'): void;
  clear(): void;
  dispose(): void;
}

const EMPTY_DOCUMENT: DrawingDocumentV1 = { version: 1, objects: [] };

type DrawingSessionOptions = {
  initialDocument?: DrawingDocumentV1;
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
  private document: DrawingDocumentV1;
  private activeTool: DrawingTool = 'pencil';
  private selectedObjectIds: readonly string[] = [];
  private defaults: DrawingToolDefaults;
  private revision = 0;
  private disposed = false;
  private commitInProgress = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: DrawingSessionOptions) {
    this.document = options.initialDocument ?? EMPTY_DOCUMENT;
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

  private applyDocument(next: DrawingDocumentV1, nextSelectedIds: readonly string[]) {
    this.document = next;
    this.selectedObjectIds = this.normalizeSelection(nextSelectedIds, next);
    this.emit();
  }

  private replayDocument = (next: DrawingDocumentV1) => {
    if (this.disposed) return false;
    if (next !== this.document) this.applyDocument(next, []);
    return true;
  };

  private commitDocument(next: DrawingDocumentV1, nextSelectedIds = this.selectedObjectIds) {
    if (next === this.document || this.disposed || this.commitInProgress) return;
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
      throw error;
    } finally {
      this.commitInProgress = false;
    }
    if (accepted !== true) {
      this.document = before;
      this.selectedObjectIds = beforeSelectedIds;
      return;
    }
    if (this.revision === revisionBeforeCommit) this.emit();
  }

  getSnapshot(): DrawingSessionSnapshot {
    return {
      document: this.document,
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
      { version: 1, objects: [...this.document.objects, object] },
      commitOptions?.select === false ? [] : [object.id]
    );
  }

  replaceObject(object: DrawingObject) {
    const index = this.document.objects.findIndex((candidate) => candidate.id === object.id);
    if (index < 0 || this.document.objects[index] === object) return;
    const objects = [...this.document.objects];
    objects[index] = object;
    this.commitDocument({ version: 1, objects });
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
    if (changed) this.commitDocument({ version: 1, objects });
  }

  deleteSelected() {
    this.deleteObjects(this.selectedObjectIds);
  }

  duplicateSelected() {
    if (this.selectedObjectIds.length === 0) return;
    const selected = new Set(this.selectedObjectIds);
    const copies = this.document.objects
      .filter((object) => selected.has(object.id))
      .map((object) => ({
        ...translateDrawingObject(object, { x: 12, y: 12 }),
        id: createDrawingId(),
      }));
    if (copies.length === 0) return;
    this.commitDocument(
      { version: 1, objects: [...this.document.objects, ...copies] },
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
    this.commitDocument({ version: 1, objects });
  }

  deleteObjects(objectIds: readonly string[]) {
    if (objectIds.length === 0) return;
    const deleted = new Set(objectIds);
    const objects = this.document.objects.filter((object) => !deleted.has(object.id));
    if (objects.length !== this.document.objects.length) {
      this.commitDocument(
        { version: 1, objects },
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
    this.selectedObjectIds = [];
  }
}

export function createDrawingSession(options: DrawingSessionOptions): DrawingSession {
  return new DrawingSessionOwner(options);
}
