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
  nextId: number;
};

const historyAssets = new WeakMap<SnapshotHistory<string>, EditorHistoryAssets>();

function encodeBinary(value: unknown, key: string, assets: EditorHistoryAssets): unknown {
  if (
    typeof value !== 'string' ||
    !value.startsWith('data:') ||
    value.length < HISTORY_BINARY_INLINE_LIMIT ||
    !(DOCUMENT_BINARY_FIELDS.has(key) || CANVAS_BINARY_FIELDS.has(key))
  ) {
    return value;
  }
  const existing = assets.byUrl.get(value);
  if (existing) return existing;
  const token = `${HISTORY_BINARY_TOKEN_PREFIX}${assets.nextId++}`;
  assets.byUrl.set(value, token);
  assets.byToken.set(token, value);
  return token;
}

function encodeEditorSnapshot(document: EditorDocument, assets: EditorHistoryAssets): string {
  return JSON.stringify(document, (key, value: unknown) => {
    if (key === 'canvasJson' && typeof value === 'string') {
      return JSON.stringify(JSON.parse(value) as unknown, (canvasKey, canvasValue: unknown) =>
        encodeBinary(canvasValue, canvasKey, assets)
      );
    }
    return encodeBinary(value, key, assets);
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
  const retained = new Set<string>();
  for (const snapshot of history.getSnapshots()) {
    JSON.parse(snapshot, (key, child: unknown) => {
      if (key === 'canvasJson' && typeof child === 'string') {
        JSON.parse(child, (canvasKey, canvasValue: unknown) => {
          if (
            CANVAS_BINARY_FIELDS.has(canvasKey) &&
            typeof canvasValue === 'string' &&
            assets.byToken.has(canvasValue)
          ) {
            retained.add(canvasValue);
          }
          return canvasValue;
        });
      }
      if (
        DOCUMENT_BINARY_FIELDS.has(key) &&
        typeof child === 'string' &&
        assets.byToken.has(child)
      ) {
        retained.add(child);
      }
      return child;
    });
  }
  for (const [token, url] of assets.byToken) {
    if (retained.has(token)) continue;
    assets.byToken.delete(token);
    assets.byUrl.delete(url);
  }
}

export function createEditorSnapshotHistory(document: EditorDocument): SnapshotHistory<string> {
  const assets: EditorHistoryAssets = { byUrl: new Map(), byToken: new Map(), nextId: 0 };
  const history = new SnapshotHistory<string>(encodeEditorSnapshot(document, assets));
  historyAssets.set(history, assets);
  return history;
}

export function resetEditorSnapshotHistory(
  history: SnapshotHistory<string>,
  document: EditorDocument
): void {
  const assets = historyAssets.get(history);
  history.reset(assets ? encodeEditorSnapshot(document, assets) : JSON.stringify(document));
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
  options.history.push(
    assets
      ? encodeEditorSnapshot(options.exportDocument(), assets)
      : JSON.stringify(options.exportDocument())
  );
  if (assets) pruneEditorHistoryAssets(options.history, assets);
  return true;
}
