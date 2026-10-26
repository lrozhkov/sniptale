// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getColorAlpha } from '@sniptale/foundation/color';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import {
  pagePreparationHistory,
  type PagePreparationHistoryBridge,
} from '../../../parser/page-preparation/history';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { TextMarkerControl } from './text-marker';

const trustedEvents = vi.hoisted(() => new WeakSet<Event>());
vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedMouseEvent: (event: Event) => event.isTrusted || trustedEvents.has(event),
}));

vi.mock('../../../../ui/color-selector', () => ({
  CompactColorSelector: ({ onChange }: { onChange: (value: string) => void }) => (
    <button data-ui="test.marker-picker" onClick={() => onChange('#20406080')}>
      Picker
    </button>
  ),
}));
vi.mock('../../../selection/locker', () => ({ setNavigationInputShieldSuspended: vi.fn() }));

let root: Root;
let host: HTMLElement;
let target: HTMLParagraphElement;
let bridge: PagePreparationHistoryBridge;
let registry: Map<string, object>;
function Harness({ visible = true, vertical = false }: { visible?: boolean; vertical?: boolean }) {
  const [active, setActive] = useState(true);
  return (
    <TextMarkerControl
      active={visible && active}
      visible={visible}
      displayMode={vertical ? 'vertical' : 'horizontal'}
      onActiveChange={setActive}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 560);
  registry = new Map();
  vi.stubGlobal('CSS', { highlights: registry });
  vi.stubGlobal(
    'Highlight',
    class {
      priority = 0;
      constructor(public range: Range) {}
    }
  );
  const frameSession = {
    frames: [],
    globalEffectMode: 'border' as const,
    globalStepBadgeSettings: { autoMode: true },
    sessionBorderPreset: DEFAULT_BORDER_PRESET,
    sessionBlurSettings: { amount: 8, blurType: 'gaussian' as const, showBorder: true },
    sessionCalloutStyle: null,
    sessionFocusSettings: { opacity: 0.5, showBorder: false },
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: [],
  };
  browserAnnotationSession.resetForDocument();
  pagePreparationHistory.clear();
  bridge = {
    captureSnapshot: () => ({
      annotations: browserAnnotationSession.captureSnapshot(),
      frameSession,
    }),
    applySnapshot: (snapshot) => browserAnnotationSession.applySnapshot(snapshot.annotations),
  };
  pagePreparationHistory.registerBridge(bridge);
  const owner = document.createElement('div');
  document.body.append(owner);
  host = initializeContentUiRoots(owner.attachShadow({ mode: 'open' })).appContainer;
  target = document.createElement('p');
  target.textContent = 'A page text range';
  document.body.append(target);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function click(selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing marker control: ${selector}`);
  act(() => button.click());
}
function select(trusted = true, start = 2, end = 11) {
  act(() => {
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(target.firstChild!, start);
    range.setEnd(target.firstChild!, end);
    selection.addRange(range);
    const source = new MouseEvent('mouseup', { button: 0, bubbles: true });
    if (trusted) trustedEvents.add(source);
    target.dispatchEvent(source);
  });
}
function marker() {
  return browserAnnotationSession.captureSnapshot().domRecords[0]?.textMarkers?.[0];
}
const eraser = '[data-ui="content.toolbar.text-marker-eraser"]';
const tool = '[data-ui="content.toolbar.text-marker"]';

it('paints immediately, erases selected intersections and resumes painting from the palette', async () => {
  await act(async () => root.render(<Harness />));
  expect(host.querySelector('.lucide-plus')).toBeNull();
  expect(host.querySelector('.lucide-list')).toBeNull();
  expect(host.querySelector('ul')).toBeNull();
  select(true, 0, 17);
  expect(marker()?.color).toBe('#ffdf0066');
  click(eraser);
  expect(host.querySelector(eraser)?.getAttribute('aria-pressed')).toBe('true');
  expect(marker()?.color).toBe('#ffdf0066');
  select();
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textMarkers).toHaveLength(2);
  select();
  act(() => pagePreparationHistory.undo('page-editing'));
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textMarkers).toHaveLength(1);
  act(() => pagePreparationHistory.redo('page-editing'));
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textMarkers).toHaveLength(2);
  click('button[title="#000000"]');
  expect(host.querySelector(eraser)?.getAttribute('aria-pressed')).toBe('false');
  select(true, 0, 17);
  expect(marker()?.color).toBe('#000000');
  click('[data-ui="content.toolbar.drawing-options.marker.opacity-30"]');
  select(true, 0, 17);
  expect(getColorAlpha(marker()!.color)).toBeCloseTo(0.3, 2);
  click('[data-ui="test.marker-picker"]');
  select(true, 0, 17);
  expect(marker()?.color).toBe('#20406080');
  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[data-ui="content.toolbar.text-marker-panel"]')).toBeNull();
  expect(host.querySelector(tool)?.getAttribute('aria-pressed')).toBe('false');
  expect(target.textContent).toBe('A page text range');
  expect(registry.size).toBe(1);
});
it('refuses untrusted extraction and preserves the source when history admission fails', async () => {
  await act(async () => root.render(<Harness />));
  select(false);
  expect(marker()).toBeUndefined();
  const admission = vi.spyOn(pagePreparationHistory, 'beginTransaction');
  admission.mockReturnValueOnce(false);
  select();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(marker()).toBeUndefined();
  expect(target.textContent).toBe('A page text range');
  select();
  click('button[title="#000000"]');
  admission.mockReturnValueOnce(false);
  select();
  expect(marker()?.color).toBe('#ffdf0066');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  admission.mockReturnValueOnce(false);
  click(eraser);
  select();
  expect(marker()).toBeDefined();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it('keeps accepted marks when vertical options hide and releases selection when the mode exits', async () => {
  await act(async () => root.render(<Harness vertical />));
  select();
  click(tool);
  expect(host.querySelector('[data-ui="content.toolbar.text-marker-panel"]')).toBeNull();
  select();
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textMarkers).toHaveLength(1);
  click(tool);
  expect(host.querySelector('[data-ui="content.toolbar.text-marker-panel"]')).not.toBeNull();
  await act(async () => root.render(<Harness visible={false} vertical />));
  expect(host.querySelector(tool)).toBeNull();
  expect(document.getElementById('sniptale-text-marker-selection')).toBeNull();
  expect(registry.size).toBe(1);
});
it('reports unavailable native highlighting without accepting a range', async () => {
  vi.stubGlobal('Highlight', undefined);
  await act(async () => root.render(<Harness />));
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  select();
  expect(marker()).toBeUndefined();
});
