import { normalizeColor, parseColor } from '@sniptale/foundation/color';
import {
  createBrowserAnnotationTargetEvidence,
  type createBrowserAnnotationSession,
} from '../../parser/page-preparation/annotations';
import type { pagePreparationHistory } from '../../parser/page-preparation/history';
import { isContentOwnedEvent, isContentOwnedElement } from '../../platform/dom-host';
import {
  addWindowEventListenerToAllWindowsDynamic,
  mountStyleInAccessibleDocuments,
} from '../../platform/frame';
import { isQuickEditTextElement } from './elements';
import { isTrustedMouseEvent } from '../../platform/trusted-events';
import {
  equalMarkerRanges,
  mergeMarkerRanges,
  subtractMarkerRange,
  type MarkerRange,
} from './text-marker-ranges';

type MarkerSession = ReturnType<typeof createBrowserAnnotationSession>;
/** Rebuilds a range only when its exact source and live target still match. */
export function restoreTextMarkerRange(
  target: Element,
  marker: { source: string; start: number; end: number }
): Range | null {
  if (!target.isConnected || target.textContent !== marker.source) return null;
  if (marker.start < 0 || marker.end <= marker.start || marker.end > marker.source.length)
    return null;
  const doc = target.ownerDocument;
  const walker = doc.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let offset = 0;
  let started = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    if (!started && marker.start < offset + length) {
      range.setStart(node, marker.start - offset);
      started = true;
    }
    if (started && marker.end <= offset + length) {
      range.setEnd(node, marker.end - offset);
      return range;
    }
    offset += length;
  }
  return null;
}

/** Owns only the disposable rendering and source-observation lifecycle. */
function createTextMarkerProjection(annotations: MarkerSession) {
  const projected: Array<{ registry: HighlightRegistry; name: string }> = [];
  let removeStyle: (() => void) | undefined;
  function clearProjection() {
    projected.splice(0).forEach(({ registry, name }) => registry.delete(name));
    removeStyle?.();
    removeStyle = undefined;
  }
  const observers = new Map<Document, MutationObserver>();
  function observe(doc: Document) {
    if (observers.has(doc)) return;
    const observer = new MutationObserver((mutations) => {
      const targets = annotations
        .captureSnapshot()
        .domRecords.filter((record) => record.textMarkers?.length)
        .map((record) => annotations.getLiveTarget(record.annotationId));
      if (
        mutations.some((mutation) =>
          targets.some(
            (target) =>
              target &&
              (target.contains(mutation.target) ||
                [...mutation.removedNodes, ...mutation.addedNodes].some((node) =>
                  node.contains(target)
                ))
          )
        )
      )
        render();
    });
    observer.observe(doc, { characterData: true, childList: true, subtree: true });
    observers.set(doc, observer);
  }
  function render() {
    clearProjection();
    const rules: string[] = [];
    const activeDocuments = new Set<Document>();
    const records = annotations.captureSnapshot().domRecords;
    for (const record of records) {
      if (!record.textMarkers?.length) continue;
      const target = annotations.getLiveTarget(record.annotationId);
      if (!target) continue;
      activeDocuments.add(target.ownerDocument);
      observe(target.ownerDocument);
      const view = target.ownerDocument.defaultView;
      if (!view || !('Highlight' in view) || !('highlights' in view.CSS)) continue;
      for (const [index, marker] of (record.textMarkers ?? []).entries()) {
        const range = restoreTextMarkerRange(target, marker);
        const color = parseColor(marker.color);
        if (!range || !color) continue;
        const name = `sniptale-text-marker-${record.annotationId}-${index}`;
        const highlight = new view.Highlight(range);
        highlight.priority = color.alpha === 1 ? 1 : 0;
        view.CSS.highlights.set(name, highlight);
        projected.push({ registry: view.CSS.highlights, name });
        const rgb = `${color.red} ${color.green} ${color.blue}`;
        const foreground = color.alpha === 1 ? `color:rgb(${rgb});text-shadow:none;` : '';
        rules.push(
          `::highlight(${name}){background-color:rgb(${rgb} / ${color.alpha});${foreground}}`
        );
      }
    }
    for (const [doc, observer] of observers) {
      if (activeDocuments.has(doc)) continue;
      observer.disconnect();
      observers.delete(doc);
    }
    if (rules.length) {
      removeStyle = mountStyleInAccessibleDocuments({
        styleId: 'sniptale-text-markers',
        textContent: rules.join('\n'),
      });
    }
  }
  const unsubscribe = annotations.subscribe(render);
  render();
  return {
    dispose: () => {
      unsubscribe();
      clearProjection();
      observers.forEach((observer) => observer.disconnect());
    },
  };
}

interface MarkerUpdate {
  target: Element;
  markers: MarkerRange[];
}
function rangeStartOffset(range: Range): number {
  const prefix = range.startContainer.ownerDocument!.createRange();
  prefix.selectNodeContents(range.startContainer.ownerDocument!.body);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}
function resolveMarkerWhitespace(annotations: MarkerSession, selection: Range) {
  const text = selection.toString();
  const start = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  if (start === 0 && end === text.length) return { start, end };
  const selectionStart = rangeStartOffset(selection);
  const selectionEnd = selectionStart + text.length;
  let joinsBefore = false;
  let joinsAfter = false;
  for (const record of annotations.captureSnapshot().domRecords) {
    const target = annotations.getLiveTarget(record.annotationId);
    if (!target || target.ownerDocument !== selection.startContainer.ownerDocument) continue;
    for (const marker of record.textMarkers ?? []) {
      const range = restoreTextMarkerRange(target, marker);
      if (!range) continue;
      const paintedStart = rangeStartOffset(range);
      const paintedEnd = paintedStart + range.toString().length;
      joinsBefore ||= paintedStart < selectionStart && paintedEnd >= selectionStart;
      joinsAfter ||= paintedStart <= selectionEnd && paintedEnd > selectionEnd;
    }
  }
  if (!text.trim() && !(joinsBefore && joinsAfter)) return null;
  return { start: joinsBefore ? 0 : start, end: joinsAfter ? text.length : end };
}
function subtractPaint(target: Element, markers: MarkerRange[], selection: Range): MarkerRange[] {
  const start = rangeStartOffset(selection);
  const end = start + selection.toString().length;
  return markers.flatMap((marker) => {
    const oldRange = restoreTextMarkerRange(target, marker);
    if (!oldRange) return [marker];
    const offset = rangeStartOffset(oldRange) - marker.start;
    return subtractMarkerRange(marker, start - offset, end - offset);
  });
}
function planMarkerPaint(
  annotations: MarkerSession,
  selection: Range,
  target: Element,
  marker: MarkerRange | null
) {
  const updates: MarkerUpdate[] = [];
  let foundTarget = false;
  for (const record of annotations.captureSnapshot().domRecords) {
    const current = annotations.getLiveTarget(record.annotationId);
    if (!current?.isConnected || current.ownerDocument !== target.ownerDocument) continue;
    const before = record.textMarkers ?? [];
    const remainder = subtractPaint(current, before, selection);
    if (current === target) {
      if (marker) remainder.push(marker);
      foundTarget = true;
    }
    const markers = mergeMarkerRanges(remainder);
    if (!equalMarkerRanges(before, markers)) updates.push({ target: current, markers });
  }
  if (!foundTarget && marker) updates.push({ target, markers: [marker] });
  return updates;
}

/** Owns range mutations and the disposable native-highlight projection for one toolbar lifetime. */
export function createTextMarkerController(deps: {
  annotations: MarkerSession;
  history: Pick<
    typeof pagePreparationHistory,
    'beginTransaction' | 'commitTransaction' | 'cancelTransaction'
  >;
}) {
  const projection = createTextMarkerProjection(deps.annotations);
  function mutate(updates: MarkerUpdate[]): boolean {
    if (!updates.length) return true;
    const key = 'text-marker';
    if (updates.some(({ target }) => !target.isConnected)) return false;
    if (!deps.history.beginTransaction(key, null, 'content-editing')) return false;
    const rollback = deps.annotations.captureFailedMutationRollbackPoint();
    try {
      deps.annotations.setTextMarkerGroups(
        updates.map(({ target, markers }) => ({
          target,
          evidence: createBrowserAnnotationTargetEvidence(target),
          markers,
        }))
      );
      if (!deps.history.commitTransaction(key))
        throw new Error('Text marker history commit refused');
      return true;
    } catch {
      deps.history.cancelTransaction(key);
      deps.annotations.rollbackFailedMutation(rollback);
      return false;
    }
  }
  return {
    supported: () =>
      typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && 'highlights' in CSS,
    add: (range: Range, value: string): boolean => {
      const selectedText = range.toString();
      if (!selectedText.length) return true;
      const whitespaceOnly = !selectedText.trim();
      const color = normalizeColor(value);
      const common = range.commonAncestorContainer;
      const ElementType = common.ownerDocument?.defaultView?.Element ?? Element;
      let target = common instanceof ElementType ? common : common.parentElement;
      // Anchor outside replaceable inline descendants so text-history replay retains identity.
      for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) {
        const HTMLElementType = ancestor.ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
        if (ancestor instanceof HTMLElementType && isQuickEditTextElement(ancestor))
          target = ancestor;
      }
      if (!color || !target || !target.isConnected || isContentOwnedElement(target))
        return whitespaceOnly;
      if (target.closest('script,style,noscript,textarea,input,[contenteditable="true"]'))
        return whitespaceOnly;
      const erasing = parseColor(color)?.alpha === 0;
      const bounds = erasing
        ? { start: 0, end: selectedText.length }
        : resolveMarkerWhitespace(deps.annotations, range);
      if (!bounds) return true;
      const prefix = target.ownerDocument.createRange();
      prefix.selectNodeContents(target);
      prefix.setEnd(range.startContainer, range.startOffset);
      const start = prefix.toString().length;
      const marker = {
        id: crypto.randomUUID(),
        color,
        source: target.textContent ?? '',
        start: start + bounds.start,
        end: start + bounds.end,
      };
      const paintRange = erasing ? range : restoreTextMarkerRange(target, marker);
      if (!paintRange) return false;
      return mutate(planMarkerPaint(deps.annotations, paintRange, target, erasing ? null : marker));
    },
    dispose: projection.dispose,
  };
}

/** Intercepts page interactions before document quick-edit handlers; native range selection stays enabled. */
export function startTextMarkerSelection(args: {
  onRange: (range: Range) => void;
  onFinish: () => void;
}): () => void {
  const removeStyle = mountStyleInAccessibleDocuments({
    styleId: 'sniptale-text-marker-selection',
    textContent: 'body,body *{user-select:text!important;cursor:text!important}',
  });
  const cleanups: Array<() => void> = [removeStyle];
  for (const type of ['mousedown', 'mousemove', 'click', 'selectstart']) {
    cleanups.push(
      addWindowEventListenerToAllWindowsDynamic(
        type,
        (event) => {
          if (isContentOwnedEvent(event)) return;
          if (type === 'click') event.preventDefault();
          event.stopImmediatePropagation();
        },
        { capture: true }
      )
    );
  }
  cleanups.push(
    addWindowEventListenerToAllWindowsDynamic<MouseEvent>(
      'mouseup',
      (event, view) => {
        if (!isTrustedMouseEvent(event) || isContentOwnedEvent(event) || event.button !== 0) return;
        const selection = view.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount) {
          args.onRange(selection.getRangeAt(0).cloneRange());
          selection.removeAllRanges();
        }
      },
      { capture: true }
    )
  );
  cleanups.push(
    addWindowEventListenerToAllWindowsDynamic<KeyboardEvent>(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || isContentOwnedEvent(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        args.onFinish();
      },
      { capture: true }
    )
  );
  return () => cleanups.forEach((cleanup) => cleanup());
}
