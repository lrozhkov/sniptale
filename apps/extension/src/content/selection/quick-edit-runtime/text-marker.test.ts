// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createBrowserAnnotationSession,
  formatBrowserAnnotationSnapshot,
  createBrowserAnnotationTargetEvidence,
} from '../../parser/page-preparation/annotations';
import { createPagePreparationHistoryStore } from '../../parser/page-preparation/history/store';
import type { FrameSessionSnapshot } from '../../parser/page-preparation/history';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { captureDomStateMap, createDomMutationBatch } from '../../parser/page-preparation/history';
import { createTextMarkerController, restoreTextMarkerRange } from './text-marker';

const frames: FrameSessionSnapshot = {
  frames: [],
  globalEffectMode: 'border',
  globalStepBadgeSettings: { autoMode: true },
  sessionBorderPreset: DEFAULT_BORDER_PRESET,
  sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
  sessionCalloutStyle: null,
  sessionFocusSettings: { opacity: 0.5, showBorder: false },
  sessionStepBadgeTemplate: null,
  stepBadgeOrder: [],
};
let annotations: ReturnType<typeof createBrowserAnnotationSession>;
let history: ReturnType<typeof createPagePreparationHistoryStore>;
let controller: ReturnType<typeof createTextMarkerController>;
let target: HTMLParagraphElement;
let registry: Map<string, object>;
beforeEach(() => {
  registry = new Map();
  vi.stubGlobal('CSS', { highlights: registry });
  vi.stubGlobal(
    'Highlight',
    class {
      priority = 0;
      constructor(public range: Range) {}
    }
  );
  annotations = createBrowserAnnotationSession();
  history = createPagePreparationHistoryStore();
  history.registerBridge({
    captureSnapshot: () => ({ annotations: annotations.captureSnapshot(), frameSession: frames }),
    applySnapshot: (snapshot) => annotations.applySnapshot(snapshot.annotations),
  });
  target = document.createElement('p');
  target.append(
    'First ',
    Object.assign(document.createElement('strong'), { textContent: 'second' }),
    ' third'
  );
  document.body.append(target);
  controller = createTextMarkerController({ annotations, history });
});
afterEach(() => {
  controller.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function list() {
  return annotations.captureSnapshot().domRecords.flatMap((record) =>
    (record.textMarkers ?? []).map((marker) => ({
      color: marker.color,
      text: marker.source.slice(marker.start, marker.end),
    }))
  );
}
function selection() {
  const range = document.createRange();
  range.setStart(target.firstChild!, 2);
  range.setEnd(target.lastChild!, 3);
  return range;
}
it('adds a multi-node range without changing source DOM and replays recolor/delete in canonical history', () => {
  const html = target.innerHTML;
  expect(controller.add(selection(), '#ffdf0066')).toBe(true);
  expect(target.innerHTML).toBe(html);
  expect(registry.size).toBe(1);
  let item = list()[0]!;
  expect(item.text).toBe('rst second th');
  const report = formatBrowserAnnotationSnapshot(annotations.captureSnapshot());
  expect(report).toContain('Text markers:');
  expect(report).toContain('#ffdf0066');
  expect(controller.add(selection(), '#ff0000')).toBe(true);
  expect(document.head.textContent).toContain('color:rgb(255 0 0);text-shadow:none');
  history.undo('page-editing');
  expect(list()[0]?.color).toBe('#ffdf0066');
  history.redo('page-editing');
  item = list()[0]!;
  expect(item.color).toBe('#ff0000');
  expect(controller.add(selection(), '#00000000')).toBe(true);
  expect(registry.size).toBe(0);
  expect(annotations.captureSnapshot().domRecords).toEqual([]);
  history.undo('page-editing');
  expect(list()[0]?.color).toBe('#ff0000');
  history.undo('page-editing');
  history.undo('page-editing');
  expect(list()).toEqual([]);
  history.redo('page-editing');
  expect(list()[0]?.color).toBe('#ffdf0066');
});
it('keeps foreign comments across text-marker undo and isolates snapshot copies', () => {
  controller.add(selection(), '#000000');
  annotations.setComment({
    target,
    evidence: createBrowserAnnotationTargetEvidence(target),
    comment: 'Keep me',
  });
  const snapshot = annotations.captureSnapshot();
  snapshot.domRecords[0]!.textMarkers![0]!.color = '#ffffff';
  expect(list()[0]?.color).toBe('#000000');
  history.undo('page-editing');
  expect(annotations.captureSnapshot().domRecords[0]?.comment).toBe('Keep me');
  expect(list()).toEqual([]);
});
it('hides stale/detached ranges and restores their projection when source returns', async () => {
  controller.add(selection(), '#ffdf00');
  const source = target.textContent;
  target.textContent = 'Replacement source';
  await Promise.resolve();
  expect(registry.size).toBe(0);
  expect(list()).toHaveLength(1);
  target.textContent = source;
  await Promise.resolve();
  expect(registry.size).toBe(1);
  target.remove();
  await Promise.resolve();
  expect(registry.size).toBe(0);
  expect(controller.add(selection(), '#00000000')).toBe(false);
});
it('refuses invalid colors and unavailable history; compensates a lost commit', () => {
  expect(controller.add(selection(), 'url(https://example.test)')).toBe(false);
  vi.spyOn(history, 'beginTransaction').mockReturnValueOnce(false);
  expect(controller.add(selection(), '#000000')).toBe(false);
  expect(list()).toEqual([]);
  vi.spyOn(history, 'commitTransaction').mockReturnValueOnce(false);
  expect(controller.add(selection(), '#000000')).toBe(false);
  expect(list()).toEqual([]);
  expect(history.hasOpenTransactions()).toBe(false);
});
it('validates exact source offsets before restoring a range', () => {
  expect(restoreTextMarkerRange(target, { source: 'wrong', start: 0, end: 3 })).toBeNull();
  expect(
    restoreTextMarkerRange(target, { source: target.textContent!, start: -1, end: 3 })
  ).toBeNull();
  expect(
    restoreTextMarkerRange(target, { source: target.textContent!, start: 2, end: 13 })?.toString()
  ).toBe('rst second ');
});

it('anchors inline selection outside descendants replaced by text editing and restores it after undo', async () => {
  const range = document.createRange();
  range.selectNodeContents(target.querySelector('strong')!);
  expect(controller.add(range, '#000000')).toBe(true);
  const before = captureDomStateMap([target]);
  const source = target.textContent!;
  history.beginTransaction('replace-text', null, 'content-editing');
  target.textContent = 'AI replacement';
  annotations.recordTextChange({
    target,
    evidence: createBrowserAnnotationTargetEvidence(target),
    before: source,
    after: target.textContent,
  });
  history.commitTransaction('replace-text', createDomMutationBatch([target], before));
  await Promise.resolve();
  expect(registry.size).toBe(0);
  history.undo('page-editing');
  await Promise.resolve();
  expect(target.textContent).toBe(source);
  expect(registry.size).toBe(1);
  expect(list()[0]?.text).toBe('second');
});

function rangeAt(element: Element, start: number, end: number) {
  const range = restoreTextMarkerRange(element, { source: element.textContent!, start, end });
  if (!range) throw new Error('Marker test range is unavailable');
  return range;
}
function spans() {
  return annotations
    .captureSnapshot()
    .domRecords.flatMap((record) =>
      (record.textMarkers ?? []).map(({ start, end, color }) => ({ start, end, color }))
    )
    .sort((a, b) => a.start - b.start);
}
it('paints the same text once without duplicate highlights or an empty history entry', () => {
  controller.add(selection(), '#ffdf0066');
  controller.add(selection(), '#ffdf0066');
  expect(list()).toHaveLength(1);
  expect(registry.size).toBe(1);
  history.undo('page-editing');
  expect(list()).toEqual([]);
});
it('overwrites intersections, splits old ranges and replays the entire paint as one history step', () => {
  const html = target.innerHTML;
  controller.add(rangeAt(target, 0, 18), '#ffdf0066');
  controller.add(rangeAt(target, 6, 12), '#ff0000');
  expect(spans()).toEqual([
    { start: 0, end: 6, color: '#ffdf0066' },
    { start: 6, end: 12, color: '#ff0000' },
    { start: 12, end: 18, color: '#ffdf0066' },
  ]);
  controller.add(rangeAt(target, 10, 16), '#000000');
  expect(spans()).toEqual([
    { start: 0, end: 6, color: '#ffdf0066' },
    { start: 6, end: 10, color: '#ff0000' },
    { start: 10, end: 16, color: '#000000' },
    { start: 16, end: 18, color: '#ffdf0066' },
  ]);
  expect(target.innerHTML).toBe(html);
  history.undo('page-editing');
  expect(list()).toHaveLength(3);
  history.undo('page-editing');
  expect(spans()).toEqual([{ start: 0, end: 18, color: '#ffdf0066' }]);
  history.redo('page-editing');
  expect(list()).toHaveLength(3);
});
it('overwrites across nested annotation anchors and compensates all records on commit refusal', () => {
  const container = document.createElement('div');
  target.replaceWith(container);
  const second = document.createElement('p');
  second.textContent = 'Another paragraph';
  container.append(target, second);
  controller.add(rangeAt(target, 0, 18), '#ffdf0066');
  const range = document.createRange();
  range.setStart(target.firstChild!, 4);
  range.setEnd(second.firstChild!, 4);
  const before = annotations.captureSnapshot();
  vi.spyOn(history, 'commitTransaction').mockReturnValueOnce(false);
  expect(controller.add(range, '#ff0000')).toBe(false);
  expect(annotations.captureSnapshot().domRecords).toEqual(before.domRecords);
  expect(controller.add(range, '#ff0000')).toBe(true);
  const records = annotations.captureSnapshot().domRecords;
  expect(
    records.find((r) => r.annotationId === annotations.getAnnotationId(target))?.textMarkers
  ).toEqual([expect.objectContaining({ start: 0, end: 4, color: '#ffdf0066' })]);
  expect(list()).toHaveLength(2);
  history.undo('page-editing');
  expect(list()).toHaveLength(1);
  expect(list()[0]?.text).toBe('First second third');
});

it('uses zero alpha as an eraser, preserves remainders and does not record an empty erase', () => {
  controller.add(rangeAt(target, 0, 18), '#ffdf0066');
  expect(controller.add(rangeAt(target, 6, 12), '#ff000000')).toBe(true);
  expect(spans()).toEqual([
    { start: 0, end: 6, color: '#ffdf0066' },
    { start: 12, end: 18, color: '#ffdf0066' },
  ]);
  expect(controller.add(rangeAt(target, 6, 12), '#00ff0000')).toBe(true);
  history.undo('page-editing');
  expect(spans()).toEqual([{ start: 0, end: 18, color: '#ffdf0066' }]);
  history.redo('page-editing');
  expect(spans()).toHaveLength(2);
  expect(controller.add(rangeAt(target, 0, 18), '#00000000')).toBe(true);
  expect(spans()).toEqual([]);
  expect(registry.size).toBe(0);
  controller.add(rangeAt(target, 0, 18), '#ffffff00');
  history.undo('page-editing');
  expect(spans()).toHaveLength(2);
});

it('accepts whitespace-only selection as a no-op without opening history', () => {
  target.textContent = ' \t \n';
  const range = document.createRange();
  range.selectNodeContents(target);
  const begin = vi.spyOn(history, 'beginTransaction');
  expect(controller.add(range, '#ffdf0066')).toBe(true);
  expect(begin).not.toHaveBeenCalled();
  expect(list()).toEqual([]);
  expect(registry.size).toBe(0);
});

it('excludes trailing whitespace across inline nodes and replays the trimmed range', () => {
  const range = document.createRange();
  range.setStart(target.firstChild!, 0);
  range.setEnd(target.lastChild!, 1);
  const html = target.innerHTML;
  expect(controller.add(range, '#ffdf0066')).toBe(true);
  expect(list().map((item) => item.text)).toEqual(['First second']);
  expect(target.innerHTML).toBe(html);
  history.undo('page-editing');
  expect(list()).toEqual([]);
  history.redo('page-editing');
  expect(list().map((item) => item.text)).toEqual(['First second']);
});
