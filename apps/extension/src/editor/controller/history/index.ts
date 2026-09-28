import { isEditorDocument } from '../../../features/editor/document/guards';
import { type EditorDocument } from '../../../features/editor/document/types';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';

const HISTORY_BINARY_INLINE_LIMIT = 4_096;
const HISTORY_BINARY_TOKEN_PREFIX = 'sniptale-history-asset:';
const CANVAS_BINARY_FIELDS = new Set([
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleBlurSourceData',
]);
const DOCUMENT_BINARY_FIELDS = new Set([
  'sourceImageData',
  'backgroundImageData',
  'faviconDataUrl',
]);

type EditorHistoryAssets = {
  byUrl: Map<string, string>;
  byToken: Map<string, string>;
  tokensBySnapshot: Map<string, Set<string>>;
  nextId: number;
};

const historyAssets = new WeakMap<SnapshotHistory<string>, EditorHistoryAssets>();

function encodeBinary(
  value: unknown,
  key: string,
  assets: EditorHistoryAssets,
  tokens: Set<string>
): unknown {
  if (
    typeof value !== 'string' ||
    !value.startsWith('data:') ||
    value.length < HISTORY_BINARY_INLINE_LIMIT ||
    !(DOCUMENT_BINARY_FIELDS.has(key) || CANVAS_BINARY_FIELDS.has(key))
  ) {
    return value;
  }
  const existing = assets.byUrl.get(value);
  if (existing) {
    tokens.add(existing);
    return existing;
  }
  const token = `${HISTORY_BINARY_TOKEN_PREFIX}${assets.nextId++}`;
  assets.byUrl.set(value, token);
  assets.byToken.set(token, value);
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
      return JSON.stringify(JSON.parse(value) as unknown, (canvasKey, canvasValue: unknown) =>
        encodeBinary(canvasValue, canvasKey, assets, tokens)
      );
    }
    return encodeBinary(value, key, assets, tokens);
  });
}

function decodeEditorSnapshot(value: string, assets?: EditorHistoryAssets): unknown {
  if (!assets) return JSON.parse(value) as unknown;
  return JSON.parse(value, (key, child: unknown) => {
    if (key === 'canvasJson' && typeof child === 'string') {
      return JSON.stringify(
        JSON.parse(child, (canvasKey, canvasValue: unknown) =>
          typeof canvasValue === 'string' && CANVAS_BINARY_FIELDS.has(canvasKey)
            ? (assets.byToken.get(canvasValue) ?? canvasValue)
            : canvasValue
        ) as unknown
      );
    }
    return typeof child === 'string' && DOCUMENT_BINARY_FIELDS.has(key)
      ? (assets.byToken.get(child) ?? child)
      : child;
  }) as unknown;
}

function pruneEditorHistoryAssets(
  history: SnapshotHistory<string>,
  assets: EditorHistoryAssets
): void {
  const retainedSnapshots = new Set(history.getSnapshots());
  for (const snapshot of assets.tokensBySnapshot.keys()) {
    if (!retainedSnapshots.has(snapshot)) assets.tokensBySnapshot.delete(snapshot);
  }
  const retained = new Set<string>();
  for (const tokens of assets.tokensBySnapshot.values()) {
    for (const token of tokens) retained.add(token);
  }
  for (const [token, url] of assets.byToken) {
    if (retained.has(token)) continue;
    assets.byToken.delete(token);
    assets.byUrl.delete(url);
  }
}

export function createEditorSnapshotHistory(document: EditorDocument): SnapshotHistory<string> {
  const assets: EditorHistoryAssets = {
    byUrl: new Map(),
    byToken: new Map(),
    tokensBySnapshot: new Map(),
    nextId: 0,
  };
  const tokens = new Set<string>();
  const snapshot = encodeEditorSnapshot(document, assets, tokens);
  const history = new SnapshotHistory<string>(snapshot);
  assets.tokensBySnapshot.set(snapshot, tokens);
  historyAssets.set(history, assets);
  return history;
}

export function resetEditorSnapshotHistory(
  history: SnapshotHistory<string>,
  document: EditorDocument
): void {
  const assets = historyAssets.get(history);
  const tokens = new Set<string>();
  const snapshot = assets
    ? encodeEditorSnapshot(document, assets, tokens)
    : JSON.stringify(document);
  history.reset(snapshot);
  if (assets) {
    assets.tokensBySnapshot.clear();
    assets.tokensBySnapshot.set(snapshot, tokens);
  }
  if (assets) pruneEditorHistoryAssets(history, assets);
}

export function readCurrentEditorSnapshot(
  history: SnapshotHistory<string> | null
): EditorDocument | null {
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

  const assets = historyAssets.get(options.history);
  const tokens = new Set<string>();
  const snapshot = assets
    ? encodeEditorSnapshot(options.exportDocument(), assets, tokens)
    : JSON.stringify(options.exportDocument());
  options.history.push(snapshot);
  if (assets) assets.tokensBySnapshot.set(snapshot, tokens);
  if (assets) pruneEditorHistoryAssets(options.history, assets);
  return true;
}
