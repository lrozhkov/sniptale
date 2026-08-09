import {
  createDefaultDrawingToolDefaults,
  type DrawingDocumentV1,
  type DrawingObject,
  type DrawingTool,
  type DrawingToolDefaults,
} from './model';

export interface DrawingSessionSnapshot {
  readonly document: DrawingDocumentV1;
  readonly activeTool: DrawingTool;
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
  commitObject(object: DrawingObject, options?: { select?: boolean }): void;
  replaceObject(object: DrawingObject): void;
  deleteSelected(): void;
  clear(): void;
  dispose(): void;
}

const EMPTY_DOCUMENT: DrawingDocumentV1 = { version: 1, objects: [] };

export function createDrawingSession(options: {
  initialDocument?: DrawingDocumentV1;
  defaults?: DrawingToolDefaults;
  onDocumentCommit: (commit: DrawingDocumentCommit) => boolean;
  onDispose?: () => void;
}): DrawingSession {
  let document = options.initialDocument ?? EMPTY_DOCUMENT;
  let activeTool: DrawingTool = 'pencil';
  let selectedObjectId: string | null = null;
  let defaults = options.defaults ?? createDefaultDrawingToolDefaults();
  let revision = 0;
  let disposed = false;
  let commitInProgress = false;
  const listeners = new Set<() => void>();

  const emit = () => {
    revision += 1;
    listeners.forEach((listener) => listener());
  };
  const snapshot = (): DrawingSessionSnapshot => ({
    document,
    activeTool,
    selectedObjectId,
    defaults,
    revision,
  });
  const applyDocument = (next: DrawingDocumentV1, nextSelectedId: string | null) => {
    document = next;
    selectedObjectId = nextSelectedId;
    emit();
  };
  const replayDocument = (next: DrawingDocumentV1) => {
    if (disposed) return false;
    if (next !== document) applyDocument(next, null);
    return true;
  };
  const commitDocument = (next: DrawingDocumentV1, nextSelectedId = selectedObjectId) => {
    if (next === document || disposed || commitInProgress) return;
    const before = document;
    const beforeSelectedId = selectedObjectId;
    const revisionBeforeCommit = revision;
    const selectedId = next.objects.some((object) => object.id === nextSelectedId)
      ? nextSelectedId
      : null;
    document = next;
    selectedObjectId = selectedId;
    commitInProgress = true;
    let accepted: boolean | undefined;
    try {
      accepted = options.onDocumentCommit({
        after: next,
        before,
        replay: replayDocument,
      });
    } catch (error) {
      document = before;
      selectedObjectId = beforeSelectedId;
      throw error;
    } finally {
      commitInProgress = false;
    }
    if (accepted !== true) {
      document = before;
      selectedObjectId = beforeSelectedId;
      return;
    }
    if (revision === revisionBeforeCommit) emit();
  };

  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActiveTool(tool) {
      if (activeTool === tool) return;
      activeTool = tool;
      if (tool !== 'select') selectedObjectId = null;
      emit();
    },
    setDefaults(next) {
      if (next === defaults) return;
      defaults = next;
      emit();
    },
    select(id) {
      if (selectedObjectId === id) return;
      selectedObjectId = id;
      emit();
    },
    commitObject(object, commitOptions) {
      commitDocument(
        { version: 1, objects: [...document.objects, object] },
        commitOptions?.select === false ? null : object.id
      );
    },
    replaceObject(object) {
      const index = document.objects.findIndex((candidate) => candidate.id === object.id);
      if (index < 0 || document.objects[index] === object) return;
      const objects = [...document.objects];
      objects[index] = object;
      commitDocument({ version: 1, objects });
    },
    deleteSelected() {
      if (!selectedObjectId) return;
      const objects = document.objects.filter((object) => object.id !== selectedObjectId);
      if (objects.length === document.objects.length) return;
      commitDocument({ version: 1, objects }, null);
    },
    clear() {
      if (document.objects.length === 0) return;
      commitDocument(EMPTY_DOCUMENT, null);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      options.onDispose?.();
      listeners.clear();
      document = EMPTY_DOCUMENT;
      selectedObjectId = null;
    },
  };
}
