import {
  encodeEditorImageHistorySnapshot,
  decodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
  type EditorImageHistoryValueKind,
} from '../../../features/editor-history/image-snapshot';
import {
  parseEditorImageHistoryCheckpoint,
  type EditorImageHistoryCheckpoint,
} from '../../../features/editor-history/image-checkpoint';
import { isEditorDocument } from '../../../features/editor/document/guards';
import { type EditorDocument } from '../../../features/editor/document/types';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { IMAGE_EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import { createDeferredEditorHistory, scheduleEditorHistoryAfterPaint } from './deferred';
import { createEditorHistoryCostIndex } from './retention-cost';
import type {
  EditorHistoryAction,
  EditorHistoryEntry,
} from '../../../features/editor-history/action';
import {
  describeEditorHistoryAction,
  describeEditorHistoryObject,
  type EditorHistoryDescription,
} from './actions';

type EditorHistoryAssets = {
  byValue: Map<string, string>;
  byToken: Map<string, string>;
  kindsByToken: Map<string, EditorImageHistoryValueKind>;
  nextId: number;
  epoch: string;
  allocationPrefix: string;
  bytesByToken: Map<string, number>;
  cost: ReturnType<typeof createEditorHistoryCostIndex>;
  actionLimit: number;
  byteLimit: number;
  descriptions: Map<string, EditorHistoryDescription>;
  actions: Map<string, Map<string, EditorHistoryAction>>;
  deferred?: ReturnType<typeof createDeferredEditorHistory>;
};

const historyAssets = new WeakMap<SnapshotHistory<string>, EditorHistoryAssets>();

function internHistoryValue(
  value: string,
  assets: EditorHistoryAssets,
  kind: EditorImageHistoryValueKind
): string {
  const existing = assets.byValue.get(value);
  if (existing) {
    return existing;
  }
  let token: string;
  do {
    token = `${assets.allocationPrefix}${assets.nextId++}`;
  } while (assets.byToken.has(token));
  assets.byValue.set(value, token);
  assets.byToken.set(token, value);
  assets.bytesByToken.set(token, new TextEncoder().encode(value).byteLength);
  assets.kindsByToken.set(token, kind);
  return token;
}

function encodeEditorSnapshot(
  document: EditorDocument,
  assets: EditorHistoryAssets,
  tokens: Set<string>
): string {
  const objects: EditorHistoryDescription['objects'] = [];
  const snapshot = encodeEditorImageHistorySnapshot(
    document,
    {
      intern: (value, kind) => internHistoryValue(value, assets, kind),
    },
    tokens,
    (token, object) => {
      const description = describeEditorHistoryObject(token, object);
      if (description) objects.push(description);
    }
  );
  const metadata: unknown = JSON.parse(snapshot);
  if (isRecord(metadata)) {
    delete metadata['canvasJson'];
    delete metadata['richShapes'];
    delete metadata['vectorDefinitions'];
    assets.descriptions.set(snapshot, { objects, document: metadata });
  }
  return snapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pruneEditorHistoryAssets(
  history: SnapshotHistory<string>,
  assets: EditorHistoryAssets
): void {
  const discarded = assets.cost.retain(history.getSnapshots());
  for (const snapshot of discarded.snapshots) {
    assets.descriptions.delete(snapshot);
    assets.actions.delete(snapshot);
    for (const actions of assets.actions.values()) actions.delete(snapshot);
  }
  for (const token of discarded.tokens) {
    const url = assets.byToken.get(token);
    assets.byToken.delete(token);
    assets.kindsByToken.delete(token);
    assets.bytesByToken.delete(token);
    if (url !== undefined) assets.byValue.delete(url);
  }
}

export function createEditorSnapshotHistory(
  document: EditorDocument,
  limits: Readonly<{ maxActions: number; maxBytes: number }> = IMAGE_EDITOR_HISTORY_LIMITS
): SnapshotHistory<string> {
  const bytesByToken = new Map<string, number>();
  const assets: EditorHistoryAssets = {
    byValue: new Map(),
    byToken: new Map(),
    kindsByToken: new Map(),
    nextId: 0,
    epoch: crypto.randomUUID(),
    allocationPrefix: IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
    bytesByToken,
    cost: createEditorHistoryCostIndex(bytesByToken),
    actionLimit: limits.maxActions,
    byteLimit: limits.maxBytes,
    descriptions: new Map(),
    actions: new Map(),
  };
  const tokens = new Set<string>();
  const snapshot = encodeEditorSnapshot(document, assets, tokens);
  assets.cost.register(snapshot, tokens);
  assets.cost.measure([snapshot]);
  const history = new SnapshotHistory<string>(snapshot, {
    limit: limits.maxActions + 1,
    maxBytes: limits.maxBytes,
    measureBytes: assets.cost.measure,
    measureWindowBytes: assets.cost.measureWindow,
  });
  bindEditorHistoryAssets(history, assets);
  return history;
}

function bindEditorHistoryAssets(
  history: SnapshotHistory<string>,
  assets: EditorHistoryAssets
): void {
  historyAssets.set(history, assets);
  assets.deferred = createDeferredEditorHistory({
    revision: () => history.getRevision(),
    commit: (document) => {
      pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
    },
    schedule: scheduleEditorHistoryAfterPaint,
    maxPending: assets.actionLimit,
  });
}

/** Defers graph collection and binds the reader to the accepted history revision. */
export function prepareEditorHistoryCheckpoint(
  history: SnapshotHistory<string> | null,
  proposedDocument?: EditorDocument
): () => EditorImageHistoryCheckpoint | null {
  const revision = history?.getRevision();
  return () =>
    history?.getRevision() === revision
      ? captureEditorHistoryCheckpoint(history, proposedDocument)
      : null;
}

/** Captures a ready graph without encoding pending work or expanding media and past documents. */
export function captureEditorHistoryCheckpoint(
  history: SnapshotHistory<string> | null,
  proposedDocument?: EditorDocument
): EditorImageHistoryCheckpoint | null {
  const assets = history && historyAssets.get(history);
  if (!history || !assets || assets.deferred?.getCount()) return null;
  if (proposedDocument) return captureProposedEditorHistory(history, assets, proposedDocument);
  return {
    version: 1,
    epoch: assets.epoch,
    cursor: history.getState().index,
    snapshots: history.getSnapshots(),
    values: [...assets.byToken].map(([id, value]) => ({
      id,
      value,
      kind: assets.kindsByToken.get(id)!,
    })),
    actions: readEditorHistoryEntries(history).map((entry) =>
      entry.action ? structuredClone(entry.action) : null
    ),
  };
}

/** Explicit saves may propose a document before its live edit is admitted, as caption edits do. */
function captureProposedEditorHistory(
  history: SnapshotHistory<string>,
  assets: EditorHistoryAssets,
  document: EditorDocument
): EditorImageHistoryCheckpoint | null {
  const bytesByToken = new Map(assets.bytesByToken);
  const cost = createEditorHistoryCostIndex(bytesByToken);
  const snapshots = history.getSnapshots();
  for (const snapshot of snapshots) cost.register(snapshot, assets.cost.tokensFor(snapshot));
  const detached: EditorHistoryAssets = {
    ...assets,
    byValue: new Map(assets.byValue),
    byToken: new Map(assets.byToken),
    kindsByToken: new Map(assets.kindsByToken),
    bytesByToken,
    cost,
    descriptions: new Map(assets.descriptions),
    actions: new Map([...assets.actions].map(([before, actions]) => [before, new Map(actions)])),
    allocationPrefix: `${IMAGE_HISTORY_VALUE_TOKEN_PREFIX}${crypto.randomUUID()}:`,
  };
  delete detached.deferred;
  const candidate = SnapshotHistory.restore(snapshots, history.getState().index, {
    limit: assets.actionLimit + 1,
    maxBytes: assets.byteLimit,
    measureBytes: cost.measure,
    measureWindowBytes: cost.measureWindow,
  });
  historyAssets.set(candidate, detached);
  pushEditorSnapshotHistory({ history: candidate, muted: false, exportDocument: () => document });
  return captureEditorHistoryCheckpoint(candidate);
}

/** Creates a new runtime lifetime only after its complete retained graph has been admitted. */
export function restoreEditorHistoryCheckpoint(
  value: unknown,
  limits: Readonly<{ maxActions: number; maxBytes: number }> = IMAGE_EDITOR_HISTORY_LIMITS
): SnapshotHistory<string> | null {
  const admitted = parseEditorImageHistoryCheckpoint(value, limits);
  if (!admitted) return null;
  const { checkpoint, tokensBySnapshot, bytesByToken } = admitted;
  const tokenBytes = new Map(bytesByToken);
  const assets: EditorHistoryAssets = {
    byValue: new Map(checkpoint.values.map((unit) => [unit.value, unit.id])),
    byToken: new Map(checkpoint.values.map((unit) => [unit.id, unit.value])),
    kindsByToken: new Map(checkpoint.values.map((unit) => [unit.id, unit.kind])),
    bytesByToken: tokenBytes,
    nextId: 0,
    epoch: checkpoint.epoch,
    // A new allocation namespace cannot reuse a retired ID from a previous writer lifetime.
    allocationPrefix: `${IMAGE_HISTORY_VALUE_TOKEN_PREFIX}${crypto.randomUUID()}:`,
    cost: createEditorHistoryCostIndex(tokenBytes),
    actionLimit: limits.maxActions,
    byteLimit: limits.maxBytes,
    descriptions: new Map(),
    actions: new Map(),
  };
  const identities = new Map<string, ReturnType<typeof describeEditorHistoryObject>>();
  for (const unit of checkpoint.values)
    if (unit.kind === 'json') {
      const object: unknown = JSON.parse(unit.value);
      identities.set(unit.id, describeEditorHistoryObject(unit.id, object));
    }
  for (const [index, snapshot] of checkpoint.snapshots.entries()) {
    assets.cost.register(snapshot, tokensBySnapshot[index]!);
    const metadata: unknown = JSON.parse(snapshot);
    if (!isRecord(metadata)) return null;
    const canvas: unknown =
      typeof metadata['canvasJson'] === 'string' ? JSON.parse(metadata['canvasJson']) : null;
    const objectTokens: unknown[] =
      isRecord(canvas) && Array.isArray(canvas['objects']) ? canvas['objects'] : [];
    if (Array.isArray(metadata['richShapes'])) {
      const shapes: unknown[] = metadata['richShapes'];
      objectTokens.push(...shapes);
    }
    const objects: EditorHistoryDescription['objects'] = [];
    for (const token of objectTokens)
      if (typeof token === 'string') {
        const identity = identities.get(token);
        if (identity) objects.push(identity);
      }
    delete metadata['canvasJson'];
    delete metadata['richShapes'];
    delete metadata['vectorDefinitions'];
    assets.descriptions.set(snapshot, { objects, document: metadata });
    const previous = checkpoint.snapshots[index - 1];
    const action = checkpoint.actions[index];
    if (previous && action) {
      const actions = assets.actions.get(previous) ?? new Map<string, EditorHistoryAction>();
      actions.set(snapshot, action);
      assets.actions.set(previous, actions);
    }
  }
  assets.cost.measure(checkpoint.snapshots);
  const history = SnapshotHistory.restore(checkpoint.snapshots, checkpoint.cursor, {
    limit: limits.maxActions + 1,
    maxBytes: limits.maxBytes,
    measureBytes: assets.cost.measure,
    measureWindowBytes: assets.cost.measureWindow,
  });
  pruneEditorHistoryAssets(history, assets);
  bindEditorHistoryAssets(history, assets);
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
  const revision = history.getRevision();
  const pending = (historyAssets.get(history)?.deferred?.getCount() ?? 0) + pendingActions;
  if (!pending)
    return {
      canUndo: current.canUndo,
      canRedo: current.canRedo,
      index: current.index,
      size: current.size,
      revision,
    };
  const index = Math.min(
    historyAssets.get(history)?.actionLimit ?? IMAGE_EDITOR_HISTORY_LIMITS.maxActions,
    current.index + pending
  );
  return { canUndo: index > 0, canRedo: false, index, size: index + 1, revision };
}

function captureEditorHistoryAction(
  assets: EditorHistoryAssets,
  before: string,
  after: string
): void {
  if (before === after) return;
  const previous = assets.descriptions.get(before);
  const next = assets.descriptions.get(after);
  if (!previous || !next) return;
  const actions = assets.actions.get(before) ?? new Map<string, EditorHistoryAction>();
  actions.set(
    after,
    describeEditorHistoryAction(previous, next, (token) => assets.byToken.get(token))
  );
  assets.actions.set(before, actions);
}

/** Reads lightweight presentation data without flushing pending capture or decoding documents. */
export function readEditorHistoryEntries(
  history: SnapshotHistory<string> | null
): EditorHistoryEntry[] {
  if (!history) return [];
  const assets = historyAssets.get(history);
  const snapshots = history.getSnapshots();
  const entries = snapshots.map((snapshot, index) => ({
    index,
    action:
      index === 0
        ? null
        : (assets?.actions.get(snapshots[index - 1]!)?.get(snapshot) ?? {
            operation: 'update' as const,
            target: null,
          }),
    pending: false,
  }));
  const pending = assets?.deferred?.getCount() ?? 0;
  if (pending) {
    entries.splice(history.getState().index + 1);
    for (let step = 0; step < pending; step++)
      entries.push({
        index: entries.length,
        action: { operation: 'update', target: null },
        pending: true,
      });
    if (entries.length > (assets?.actionLimit ?? 0) + 1)
      entries.splice(0, entries.length - (assets?.actionLimit ?? 0) - 1);
  }
  return entries.map((entry, index) => ({
    ...entry,
    index,
    action: index === 0 ? null : entry.action,
  }));
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
  assets?.cost.register(snapshot, tokens);
  history.reset(snapshot);
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
    const parsed = decodeEditorImageHistorySnapshot(
      value,
      assets ? (token) => assets.byToken.get(token) : undefined
    );
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
  assets?.cost.register(snapshot, tokens);
  if (assets) captureEditorHistoryAction(assets, options.history.getCurrent(), snapshot);
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
  const snapshots = history.getSnapshots();
  const index = history.getState().index;
  const previous = snapshots[index - 1];
  const current = snapshots[index];
  const action = previous && current ? assets?.actions.get(previous)?.get(current) : undefined;
  const tokens = new Set<string>();
  const document = options.exportDocument();
  const snapshot = assets
    ? encodeEditorSnapshot(document, assets, tokens)
    : JSON.stringify(document);
  assets?.cost.register(snapshot, tokens);
  const replaced = history.replaceCurrent(options.expectedRevision, snapshot);
  if (replaced && previous && action && assets) assets.actions.get(previous)?.set(snapshot, action);
  if (assets) pruneEditorHistoryAssets(history, assets);
  return replaced !== null;
}
