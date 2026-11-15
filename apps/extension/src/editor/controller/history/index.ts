import { EDITOR_RASTER_BINARY_FIELDS } from '../../../features/editor/document/raster-state';
import { isEditorDocument } from '../../../features/editor/document/guards';
import { type EditorDocument } from '../../../features/editor/document/types';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { IMAGE_EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import { createDeferredEditorHistory, scheduleEditorHistoryAfterPaint } from './deferred';

const HISTORY_VALUE_INLINE_LIMIT = 4_096;
const HISTORY_VALUE_TOKEN_PREFIX = 'sniptale-history-asset:';
const CANVAS_POOLED_FIELDS = new Set([
  ...EDITOR_RASTER_BINARY_FIELDS,
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleSimplifySourceData',
  'sniptaleBlurSourceData',
  'sniptaleDrawingJson',
]);
const DOCUMENT_POOLED_FIELDS = new Set([
  'sourceImageData',
  'backgroundImageData',
  'faviconDataUrl',
]);

type EditorHistoryAssets = {
  byValue: Map<string, string>;
  byToken: Map<string, string>;
  tokensBySnapshot: Map<string, Set<string>>;
  nextId: number;
  bytesByToken: Map<string, number>;
  bytesBySnapshot: Map<string, number>;
  actionLimit: number;
  deferred?: ReturnType<typeof createDeferredEditorHistory>;
};

const historyAssets = new WeakMap<SnapshotHistory<string>, EditorHistoryAssets>();

function encodeSharedValue(
  value: unknown,
  key: string,
  assets: EditorHistoryAssets,
  tokens: Set<string>
): unknown {
  if (
    typeof value !== 'string' ||
    value.length < HISTORY_VALUE_INLINE_LIMIT ||
    (key !== 'sniptaleDrawingJson' && !value.startsWith('data:')) ||
    !(DOCUMENT_POOLED_FIELDS.has(key) || CANVAS_POOLED_FIELDS.has(key))
  ) {
    return value;
  }
  return internHistoryValue(value, assets, tokens);
}

function internHistoryValue(
  value: string,
  assets: EditorHistoryAssets,
  tokens: Set<string>
): string {
  const existing = assets.byValue.get(value);
  if (existing) {
    tokens.add(existing);
    return existing;
  }
  const token = `${HISTORY_VALUE_TOKEN_PREFIX}${assets.nextId++}`;
  assets.byValue.set(value, token);
  assets.byToken.set(token, value);
  assets.bytesByToken.set(token, new TextEncoder().encode(value).byteLength);
  tokens.add(token);
  return token;
}

function encodeEditorSnapshot(
  document: EditorDocument,
  assets: EditorHistoryAssets,
  tokens: Set<string>
): string {
  return JSON.stringify(document, (key, value: unknown) => {
    if (key === 'canvasJson' && typeof value === 'string') {
      return encodeCanvasHistoryValue(JSON.parse(value) as unknown, assets, tokens);
    }
    if (key === 'vectorDefinitions' && isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([id, definition]) => [
          id,
          internHistoryValue(JSON.stringify(definition), assets, tokens),
        ])
      );
    }
    if (key === 'richShapes' && Array.isArray(value))
      return poolObjectVersions(value, assets, tokens);
    return encodeSharedValue(value, key, assets, tokens);
  });
}

function encodeCanvasHistoryValue(
  value: unknown,
  assets: EditorHistoryAssets,
  tokens: Set<string>
): string {
  return JSON.stringify(value, (key, child: unknown) => {
    if (key === 'objects' && Array.isArray(child)) return poolObjectVersions(child, assets, tokens);
    return encodeSharedValue(child, key, assets, tokens);
  });
}

function poolObjectVersions(
  objects: unknown[],
  assets: EditorHistoryAssets,
  tokens: Set<string>
): unknown[] {
  return objects.map((object: unknown) =>
    isRecord(object)
      ? internHistoryValue(encodeCanvasHistoryValue(object, assets, tokens), assets, tokens)
      : object
  );
}

function restoreObjectVersions(objects: unknown[], assets: EditorHistoryAssets): unknown[] {
  return objects.map((object: unknown) => {
    if (typeof object !== 'string') return object;
    const pooled = assets.byToken.get(object);
    return pooled === undefined ? object : (JSON.parse(pooled) as unknown);
  });
}

function decodeEditorSnapshot(value: string, assets?: EditorHistoryAssets): unknown {
  const document = JSON.parse(value) as unknown;
  if (!assets || !isRecord(document)) return document;
  restoreSharedFields(document, DOCUMENT_POOLED_FIELDS, assets);
  const definitions = document['vectorDefinitions'];
  if (isRecord(definitions)) {
    for (const [id, token] of Object.entries(definitions)) {
      if (typeof token !== 'string') continue;
      const pooled = assets.byToken.get(token);
      if (pooled !== undefined) definitions[id] = JSON.parse(pooled) as unknown;
    }
  }
  if (Array.isArray(document['richShapes'])) {
    const shapes = restoreObjectVersions(document['richShapes'], assets);
    restoreSharedFields(shapes, CANVAS_POOLED_FIELDS, assets, true);
    document['richShapes'] = shapes;
  }
  const canvasJson = document['canvasJson'];
  if (typeof canvasJson === 'string' && canvasJson.includes(HISTORY_VALUE_TOKEN_PREFIX)) {
    const canvas = JSON.parse(canvasJson) as unknown;
    restoreSharedFields(canvas, CANVAS_POOLED_FIELDS, assets, true);
    document['canvasJson'] = JSON.stringify(canvas);
  }
  return document;
}

function restoreSharedFields(
  root: unknown,
  fieldNames: ReadonlySet<string>,
  assets: EditorHistoryAssets,
  restoreObjects = false
): void {
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (const child of current) {
        if (typeof child === 'object' && child !== null) pending.push(child);
      }
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [key, child] of Object.entries(current)) {
      if (restoreObjects && key === 'objects' && Array.isArray(child)) {
        const objects = restoreObjectVersions(child, assets);
        current[key] = objects;
        pending.push(objects);
      } else if (typeof child === 'string' && fieldNames.has(key)) {
        current[key] = assets.byToken.get(child) ?? child;
      } else if (typeof child === 'object' && child !== null) {
        pending.push(child);
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pruneEditorHistoryAssets(
  history: SnapshotHistory<string>,
  assets: EditorHistoryAssets
): void {
  const retainedSnapshots = new Set(history.getSnapshots());
  for (const snapshot of assets.tokensBySnapshot.keys()) {
    if (!retainedSnapshots.has(snapshot)) {
      assets.tokensBySnapshot.delete(snapshot);
      assets.bytesBySnapshot.delete(snapshot);
    }
  }
  const retained = new Set<string>();
  for (const tokens of assets.tokensBySnapshot.values()) {
    for (const token of tokens) retained.add(token);
  }
  for (const [token, url] of assets.byToken) {
    if (retained.has(token)) continue;
    assets.byToken.delete(token);
    assets.bytesByToken.delete(token);
    assets.byValue.delete(url);
  }
}

export function createEditorSnapshotHistory(
  document: EditorDocument,
  limits: Readonly<{ maxActions: number; maxBytes: number }> = IMAGE_EDITOR_HISTORY_LIMITS
): SnapshotHistory<string> {
  const assets: EditorHistoryAssets = {
    byValue: new Map(),
    byToken: new Map(),
    tokensBySnapshot: new Map(),
    nextId: 0,
    bytesByToken: new Map(),
    bytesBySnapshot: new Map(),
    actionLimit: limits.maxActions,
  };
  const tokens = new Set<string>();
  const snapshot = encodeEditorSnapshot(document, assets, tokens);
  assets.tokensBySnapshot.set(snapshot, tokens);
  assets.bytesBySnapshot.set(snapshot, new TextEncoder().encode(snapshot).byteLength);
  const history = new SnapshotHistory<string>(snapshot, {
    limit: limits.maxActions + 1,
    maxBytes: limits.maxBytes,
    measureBytes: (snapshots) => {
      let bytes = 0;
      let smallestBaseline = Number.POSITIVE_INFINITY;
      const retained = new Set<string>();
      for (const value of snapshots) {
        const metadata =
          assets.bytesBySnapshot.get(value) ?? new TextEncoder().encode(value).byteLength;
        bytes += metadata;
        let baseline = metadata;
        for (const token of assets.tokensBySnapshot.get(value) ?? []) {
          retained.add(token);
          baseline += assets.bytesByToken.get(token) ?? 0;
        }
        smallestBaseline = Math.min(smallestBaseline, baseline);
      }
      for (const token of retained) bytes += assets.bytesByToken.get(token) ?? 0;
      // Bound additional history at every possible cursor. Current content is mandatory,
      // and a retained window must stay affordable in both Undo and Redo directions.
      return bytes - smallestBaseline;
    },
  });
  historyAssets.set(history, assets);
  assets.deferred = createDeferredEditorHistory({
    revision: () => history.getRevision(),
    commit: (document) => {
      pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
    },
    schedule: scheduleEditorHistoryAfterPaint,
    maxPending: limits.maxActions,
  });
  return history;
}

/** Captures an admitted document step while deferring only its history encoding. */
export function deferEditorSnapshotHistory(
  history: SnapshotHistory<string>,
  options: Parameters<ReturnType<typeof createDeferredEditorHistory>['enqueue']>[0]
): boolean {
  const deferred = historyAssets.get(history)?.deferred;
  if (!deferred) return false;
  deferred.enqueue(options);
  return true;
}

/** Commits pending steps before an explicit history mutation. */
export function flushDeferredEditorHistory(history: SnapshotHistory<string> | null): void {
  if (history) historyAssets.get(history)?.deferred?.flush();
}

/** Drops obsolete encoding jobs when their document/history lifetime ends. */
export function cancelDeferredEditorHistory(history: SnapshotHistory<string> | null): void {
  if (history) historyAssets.get(history)?.deferred?.cancel();
}

/** Projects captured steps immediately, including before the first encoded Undo entry. */
export function readEditorHistoryState(
  history: SnapshotHistory<string> | null,
  pendingActions = 0
) {
  if (!history) return { canUndo: false, canRedo: false, index: 0, size: 1 };
  const current = history.getState();
  const pending = (historyAssets.get(history)?.deferred?.getCount() ?? 0) + pendingActions;
  if (!pending)
    return {
      canUndo: current.canUndo,
      canRedo: current.canRedo,
      index: current.index,
      size: current.size,
    };
  const index = Math.min(
    historyAssets.get(history)?.actionLimit ?? IMAGE_EDITOR_HISTORY_LIMITS.maxActions,
    current.index + pending
  );
  return { canUndo: index > 0, canRedo: false, index, size: index + 1 };
}

export function resetEditorSnapshotHistory(
  history: SnapshotHistory<string>,
  document: EditorDocument
): void {
  cancelDeferredEditorHistory(history);
  const assets = historyAssets.get(history);
  const tokens = new Set<string>();
  const snapshot = assets
    ? encodeEditorSnapshot(document, assets, tokens)
    : JSON.stringify(document);
  history.reset(snapshot);
  if (assets) {
    assets.tokensBySnapshot.clear();
    assets.bytesBySnapshot.clear();
    assets.tokensBySnapshot.set(snapshot, tokens);
    assets.bytesBySnapshot.set(snapshot, new TextEncoder().encode(snapshot).byteLength);
  }
  if (assets) pruneEditorHistoryAssets(history, assets);
}

export function readCurrentEditorSnapshot(
  history: SnapshotHistory<string> | null
): EditorDocument | null {
  const pending = history && historyAssets.get(history)?.deferred?.peek();
  if (pending) return structuredClone(pending);
  return history
    ? parseEditorSnapshotDocument(history.getCurrent(), historyAssets.get(history))
    : null;
}

function parseEditorSnapshotDocument(
  value: string,
  assets?: EditorHistoryAssets
): EditorDocument | null {
  try {
    const parsed = decodeEditorSnapshot(value, assets);
    return isEditorHistoryDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isEditorHistoryDocument(value: unknown): value is EditorDocument {
  if (isEditorDocument(value)) return true;
  if (
    typeof value !== 'object' ||
    value === null ||
    !('sourceImageData' in value) ||
    typeof value.sourceImageData !== 'string' ||
    !value.sourceImageData.startsWith('blob:') ||
    value.sourceImageData.length <= 'blob:'.length
  ) {
    return false;
  }
  // Legacy history can contain runtime Blob URLs; import validation still requires image data URLs.
  return isEditorDocument({ ...value, sourceImageData: 'data:image/png;base64,QUJDRA==' });
}

export function undoEditorSnapshot(history: SnapshotHistory<string> | null): EditorDocument | null {
  flushDeferredEditorHistory(history);
  const state = history?.undo();
  if (!state) {
    return null;
  }

  const document = parseEditorSnapshotDocument(
    state.current,
    history ? historyAssets.get(history) : undefined
  );
  if (!document) history?.redo();
  return document;
}

export function redoEditorSnapshot(history: SnapshotHistory<string> | null): EditorDocument | null {
  flushDeferredEditorHistory(history);
  const state = history?.redo();
  if (!state) {
    return null;
  }

  const document = parseEditorSnapshotDocument(
    state.current,
    history ? historyAssets.get(history) : undefined
  );
  if (!document) history?.undo();
  return document;
}

export function pushEditorSnapshotHistory(options: {
  history: SnapshotHistory<string> | null;
  muted: boolean;
  exportDocument: () => EditorDocument;
}): boolean {
  if (options.muted || !options.history) {
    return false;
  }

  flushDeferredEditorHistory(options.history);

  const assets = historyAssets.get(options.history);
  const tokens = new Set<string>();
  const snapshot = assets
    ? encodeEditorSnapshot(options.exportDocument(), assets, tokens)
    : JSON.stringify(options.exportDocument());
  if (assets) assets.tokensBySnapshot.set(snapshot, tokens);
  if (assets) assets.bytesBySnapshot.set(snapshot, new TextEncoder().encode(snapshot).byteLength);
  options.history.push(snapshot);
  if (assets) pruneEditorHistoryAssets(options.history, assets);
  return true;
}

/** Обновляет производный растр текущего действия без дополнительного шага Undo. */
export function replaceCurrentEditorSnapshotHistory(options: {
  history: SnapshotHistory<string> | null;
  expectedRevision: number;
  exportDocument: () => EditorDocument;
}): boolean {
  const history = options.history;
  flushDeferredEditorHistory(history);
  if (!history || history.getRevision() !== options.expectedRevision) return false;
  const assets = historyAssets.get(history);
  const tokens = new Set<string>();
  const document = options.exportDocument();
  const snapshot = assets
    ? encodeEditorSnapshot(document, assets, tokens)
    : JSON.stringify(document);
  if (assets) {
    assets.tokensBySnapshot.set(snapshot, tokens);
    assets.bytesBySnapshot.set(snapshot, new TextEncoder().encode(snapshot).byteLength);
  }
  const replaced = history.replaceCurrent(options.expectedRevision, snapshot);
  if (assets) pruneEditorHistoryAssets(history, assets);
  return replaced !== null;
}
