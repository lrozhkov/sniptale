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
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly revision: number;
}

export interface DrawingSession {
  getSnapshot(): DrawingSessionSnapshot;
  subscribe(listener: () => void): () => void;
  setActiveTool(tool: DrawingTool): void;
  setDefaults(defaults: DrawingToolDefaults): void;
  select(objectId: string | null): void;
  commitObject(object: DrawingObject): void;
  replaceObject(object: DrawingObject): void;
  deleteSelected(): void;
  clear(): void;
  reset(): void;
  undo(): void;
  redo(): void;
  dispose(): void;
}

const EMPTY_DOCUMENT: DrawingDocumentV1 = { version: 1, objects: [] };

export function createDrawingSession(options?: {
  initialDocument?: DrawingDocumentV1;
  defaults?: DrawingToolDefaults;
  historyLimit?: number;
}): DrawingSession {
  let document = options?.initialDocument ?? EMPTY_DOCUMENT;
  let activeTool: DrawingTool = 'pencil';
  let selectedObjectId: string | null = null;
  let defaults = options?.defaults ?? createDefaultDrawingToolDefaults();
  let revision = 0;
  let past: DrawingDocumentV1[] = [];
  let future: DrawingDocumentV1[] = [];
  const listeners = new Set<() => void>();
  const historyLimit = options?.historyLimit ?? 80;

  const emit = () => {
    revision += 1;
    listeners.forEach((listener) => listener());
  };
  const snapshot = (): DrawingSessionSnapshot => ({
    document,
    activeTool,
    selectedObjectId,
    defaults,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    revision,
  });
  const commitDocument = (next: DrawingDocumentV1) => {
    if (next === document) return;
    past = [...past.slice(Math.max(0, past.length - historyLimit + 1)), document];
    document = next;
    future = [];
    if (selectedObjectId && !document.objects.some((object) => object.id === selectedObjectId)) {
      selectedObjectId = null;
    }
    emit();
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
    commitObject(object) {
      selectedObjectId = object.id;
      commitDocument({ version: 1, objects: [...document.objects, object] });
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
      selectedObjectId = null;
      commitDocument({ version: 1, objects });
    },
    clear() {
      if (document.objects.length === 0) return;
      selectedObjectId = null;
      commitDocument(EMPTY_DOCUMENT);
    },
    reset() {
      document = EMPTY_DOCUMENT;
      past = [];
      future = [];
      selectedObjectId = null;
      emit();
    },
    undo() {
      const previous = past[past.length - 1];
      if (!previous) return;
      past = past.slice(0, -1);
      future = [document, ...future].slice(0, historyLimit);
      document = previous;
      selectedObjectId = null;
      emit();
    },
    redo() {
      const next = future[0];
      if (!next) return;
      future = future.slice(1);
      past = [...past, document].slice(-historyLimit);
      document = next;
      selectedObjectId = null;
      emit();
    },
    dispose() {
      listeners.clear();
      document = EMPTY_DOCUMENT;
      past = [];
      future = [];
      selectedObjectId = null;
    },
  };
}
