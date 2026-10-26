import { parsePagePreparationRecovery } from './recovery-parser';
import { parseDrawingDocument } from '../../../../features/drawing/public';
import type { DrawingDocumentV1 } from '../../../../features/drawing/model';
import { captureDomElementState, createDomMutationPatch, portableElementState } from './dom';
import {
  applyHistoryEntry,
  notifyHistoryReachabilityChanged,
  publishHistoryState,
  type HistoryStoreRuntimeState,
} from './store-state';
import {
  createRecoveryLocator,
  resolveRecoveryLocator,
  portableSessionSnapshot,
} from './recovery-locators';
import type {
  DrawingRecoveryEffect,
  PagePreparationHistoryEntry,
  PagePreparationRecovery,
  PagePreparationDomElement,
} from './types';

function canRecover(state: HistoryStoreRuntimeState): boolean {
  return (
    !!state.bridge &&
    !state.isApplying &&
    state.transactions.size === 0 &&
    state.deferredCommits.size === 0
  );
}
function captureRecovery(
  state: HistoryStoreRuntimeState,
  captureDrawing: (() => DrawingDocumentV1) | undefined
): PagePreparationRecovery | null {
  if (!canRecover(state)) throw new Error('Page recovery is not ready');
  if (state.past.length === 0) return null;
  const retained = new Map<Element, string>();
  for (const entry of state.past) {
    if (entry.domEffect && (!entry.domEffect.recovery || entry.domEffect.recoveryOnly))
      throw new Error('Page recovery cannot capture the pending owner effect');
    for (const patch of entry.domBatch?.patches ?? [])
      if (patch.recoveryLocator) retained.set(patch.target, patch.recoveryLocator);
  }
  // Restore is one drawing action; the ordinary source history and ordered page edits stay intact.
  const drawingEntries = state.past.filter(
    (entry) => entry.scope === 'drawing' && entry.domEffect?.recovery
  );
  const firstDrawing = drawingEntries[0]?.domEffect?.recovery;
  const lastDrawingEntry = drawingEntries.at(-1);
  const lastDrawing = lastDrawingEntry?.domEffect?.recovery;
  const drawingVersion =
    firstDrawing && lastDrawing
      ? { before: firstDrawing.before, after: captureDrawing?.() ?? lastDrawing.after }
      : null;
  const drawingChanged =
    drawingVersion !== null &&
    JSON.stringify(drawingVersion.before) !== JSON.stringify(drawingVersion.after);
  const entries = state.past.filter(
    (entry) => entry.scope !== 'drawing' || (entry === lastDrawingEntry && drawingChanged)
  );
  if (entries.length === 0) return null;
  return {
    version: 1,
    entries: entries.map((entry) => ({
      scope: entry.scope,
      before: portableSessionSnapshot(entry.before, state.bridge!, retained),
      after: portableSessionSnapshot(entry.after, state.bridge!, retained),
      patches: (entry.domBatch?.patches ?? []).map((patch) => ({
        selector: patch.recoveryLocator ?? createRecoveryLocator(patch.target),
        before: portableElementState(patch.before),
        after: portableElementState(patch.after),
      })),
      drawing: entry.scope === 'drawing' && drawingVersion ? structuredClone(drawingVersion) : null,
    })),
  };
}

type DrawingReplay = {
  replay: (document: DrawingDocumentV1) => boolean;
  hasChanges: () => boolean;
  captureDocument: () => DrawingDocumentV1;
};

/** Prepares one ordered step after earlier edits have created its possible DOM targets. */
function prepareEntry(
  entry: PagePreparationRecovery['entries'][number],
  drawing: DrawingReplay | null
): PagePreparationHistoryEntry | null {
  let recoveredDrawing: DrawingRecoveryEffect | null = null;
  if (entry.drawing) {
    if (!drawing) return null;
    const before = parseDrawingDocument(entry.drawing.before);
    const after = parseDrawingDocument(entry.drawing.after);
    if (!before || !after) return null;
    recoveredDrawing = { before, after };
  }
  const targets = new Map<string, PagePreparationDomElement>();
  for (const patch of entry.patches) {
    const target = resolveRecoveryLocator(patch.selector);
    const view = target?.ownerDocument.defaultView;
    if (!view || !(target instanceof view.HTMLElement || target instanceof view.SVGElement))
      return null;
    const current = portableElementState(captureDomElementState(target));
    if (patch.before.html !== patch.after.html && current.html !== patch.before.html) return null;
    for (const name of new Set([
      ...Object.keys(patch.before.attributes),
      ...Object.keys(patch.after.attributes),
    ])) {
      if (
        patch.before.attributes[name] !== patch.after.attributes[name] &&
        current.attributes[name] !== patch.before.attributes[name]
      )
        return null;
    }
    targets.set(patch.selector, target);
  }
  return {
    scope: entry.scope,
    before: structuredClone(entry.before),
    after: structuredClone(entry.after),
    domBatch: entry.patches.length
      ? {
          patches: entry.patches.map((patch) => {
            const binding = createDomMutationPatch(targets.get(patch.selector)!);
            const identity = binding.before.attributes['data-sniptale-id'];
            const attributes = identity ? { 'data-sniptale-id': identity } : {};
            return {
              ...binding,
              before: {
                ...patch.before,
                attributes: { ...patch.before.attributes, ...attributes },
              },
              after: { ...patch.after, attributes: { ...patch.after.attributes, ...attributes } },
            };
          }),
        }
      : null,
    domEffect: recoveredDrawing
      ? {
          recovery: recoveredDrawing,
          hasChanges: true,
          hasCurrentChanges: () => drawing?.hasChanges() ?? false,
          apply: (direction) =>
            drawing!.replay(recoveredDrawing![direction === 'undo' ? 'before' : 'after'])
              ? { success: true, failures: [] }
              : { success: false, failures: ['drawing-recovery-unavailable'] },
        }
      : null,
  };
}

/** Keeps factual entries when compensation cannot finish; the private source remains reusable. */
function rollbackRecovery(
  state: HistoryStoreRuntimeState,
  applied: PagePreparationHistoryEntry[],
  appliedEvent: string
): false {
  while (applied.length) {
    const outcome = applyHistoryEntry('undo', appliedEvent, applied.at(-1)!, state);
    if (outcome.status !== 'applied') {
      if (outcome.status === 'recovery') {
        if (outcome.replaceCurrent) applied[applied.length - 1] = outcome.entry;
        else applied.push(outcome.entry);
      }
      break;
    }
    applied.pop();
  }
  state.past = applied;
  notifyHistoryReachabilityChanged(state);
  publishHistoryState(state);
  return false;
}

/** Uses the existing history receiver and its compensation path; it owns no second history. */
export function createHistoryRecoveryApi(state: HistoryStoreRuntimeState, appliedEvent: string) {
  let drawing: DrawingReplay | null = null;
  let knownPast = state.past;
  let sourceToken = {};
  return {
    /** Opaque source identity excludes layout-only availability refreshes from user-change TTL. */
    getRecoveryToken(): object {
      if (knownPast !== state.past) {
        knownPast = state.past;
        sourceToken = {};
      }
      return sourceToken;
    },
    registerDrawingRecovery(
      replay: (document: DrawingDocumentV1) => boolean,
      hasChanges: () => boolean,
      captureDocument: () => DrawingDocumentV1
    ) {
      drawing = { replay, hasChanges, captureDocument };
      return () => {
        if (drawing?.replay === replay) drawing = null;
      };
    },
    captureRecovery: () => captureRecovery(state, drawing?.captureDocument),
    restoreRecovery(value: unknown): boolean {
      const packet = parsePagePreparationRecovery(value);
      if (!packet) return false;
      if (!canRecover(state) || state.past.length || state.future.length || packet.version !== 1)
        return false;
      if (!packet.entries.length) return false;
      const applied: PagePreparationHistoryEntry[] = [];
      try {
        for (const saved of packet.entries) {
          const entry = prepareEntry(saved, drawing);
          if (!entry) return rollbackRecovery(state, applied, appliedEvent);
          const outcome = applyHistoryEntry('redo', appliedEvent, entry, state);
          if (outcome.status !== 'applied') {
            if (outcome.status === 'recovery') {
              state.past = [...applied, outcome.entry];
              notifyHistoryReachabilityChanged(state);
              publishHistoryState(state);
              return false;
            }
            return rollbackRecovery(state, applied, appliedEvent);
          }
          applied.push(entry);
        }
        state.bridge?.onRecoveryApplied?.();
      } catch {
        return rollbackRecovery(state, applied, appliedEvent);
      }
      state.past = applied;
      notifyHistoryReachabilityChanged(state);
      publishHistoryState(state);
      return true;
    },
  };
}
