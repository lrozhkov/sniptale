// @vitest-environment jsdom
import { act } from 'react';
import type { DesignReviewTool } from '../../../../selection/design-review';

vi.mock('../../../../selection/design-review/move-coordinates', () => ({
  readDesignReviewMoveCoordinates: () => ({
    coefficients: [1, 0, 0, 1],
    ancestors: [],
    toLocal: (point: { x: number; y: number }) => point,
    matches: () => true,
  }),
}));

vi.mock('../../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/trusted-events')>()),
  isTrustedPointerEvent: vi.fn(() => true),
  isTrustedMouseEvent: vi.fn(() => true),
}));
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../../features/highlighter/style/defaults';
import { pagePreparationHistory } from '../../../../parser/page-preparation/history';
import { browserAnnotationSession } from '../../../../parser/page-preparation/annotations';
import type {
  PagePreparationHistoryBridge,
  FrameSessionSnapshot,
} from '../../../../parser/page-preparation/history/types';
import { readPageStyleSelectionSnapshot } from '../../../../selection/design-review/snapshot';
import {
  createPageStyleValuesFromPatch,
  type PageStyleDeclarationValueMap,
} from '../../../../selection/design-review/snapshot';
import { useDesignReviewTools } from '../../session/tools';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';
import { ReviewToolsSection } from './tools';
import { DesignReviewMoveSurface } from '../../tools/move';
import { InspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { useState } from 'react';

let root: Root;
let host: HTMLDivElement;
let target: HTMLElement;
let bridge: PagePreparationHistoryBridge;
let tools: ReturnType<typeof useDesignReviewTools>;

function Harness({
  enabled = true,
  selected = true,
  tool = 'inspect',
}: {
  enabled?: boolean;
  selected?: boolean;
  tool?: Exclude<DesignReviewTool, 'comment'>;
}) {
  const selection = selected ? readPageStyleSelectionSnapshot(target) : null;
  const [values, updateValues] = useState<PageStyleDeclarationValueMap>(() =>
    createPageStyleValuesFromPatch(selection?.patch ?? { declarations: [] })
  );
  tools = useDesignReviewTools(enabled, selection, updateValues);
  const actions: DesignReviewActions = {
    tools,
    close: vi.fn(),
    comment: {
      commit: () => true,
      endComposition: vi.fn(),
      startComposition: vi.fn(),
      updateDraft: vi.fn(),
    },
    copyElement: async () => true,
    copyPath: async () => undefined,
    navigateElement: vi.fn(),
    delete: vi.fn(),
    resetValue: vi.fn(),
    selectAction: vi.fn(),
    setSettingsOpen: vi.fn(),
    text: { edit: vi.fn(), reset: vi.fn() },
    updateValue: vi.fn(),
    updateValues: vi.fn(),
    voice: { start: vi.fn(), stop: vi.fn(), cancel: vi.fn() },
  };
  const state: DesignReviewViewState = {
    action: 'refine',
    anchor: null,
    comment: { commitFailed: false, draft: '', marker: null },
    defaultValues: {},
    draftPatch: { declarations: [] },
    modifiedProperties: [],
    selection,
    settingsOpen: true,
    text: { editable: true, modified: false, preview: 'Target', resettable: false },
    treeNavigation: { parent: null, child: null },
    values,
    voice: {
      active: false,
      pending: false,
      audioLevel: 0,
      caretPosition: null,
      errorCode: null,
      phase: 'idle',
    },
  };
  return (
    <InspectorLayout>
      {tool === 'move' ? (
        <DesignReviewMoveSurface enabled={enabled} actions={actions} state={state} />
      ) : (
        <ReviewToolsSection tool={tool} actions={actions} state={state} disabled={!enabled} />
      )}
    </InspectorLayout>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  browserAnnotationSession.resetForDocument();
  const frameSession: FrameSessionSnapshot = {
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
  bridge = {
    captureSnapshot: () => ({
      annotations: browserAnnotationSession.captureSnapshot(),
      frameSession,
    }),
    applySnapshot: (snapshot) => browserAnnotationSession.applySnapshot(snapshot.annotations),
  };
  pagePreparationHistory.registerBridge(bridge);
  target = document.createElement('button');
  target.id = 'target';
  target.textContent = 'Target';
  const rect = DOMRect.fromRect({ width: 100, height: 40 });
  Object.defineProperty(target, 'getClientRects', { value: () => [rect] });
  Object.defineProperty(target, 'getBoundingClientRect', { value: () => rect });
  host = document.createElement('div');
  document.body.append(target, host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function css(value: string) {
  const field = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      value
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function pointer(
  control: HTMLElement,
  type: string,
  x: number,
  y: number,
  id = 1,
  mouseButton = 0
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: mouseButton,
  });
  Object.defineProperty(event, 'pointerId', { value: id });
  control.dispatchEvent(event);
}

it('applies CSS and preserves invalid drafts while Move uses the shared history', async () => {
  await act(async () => root.render(<Harness />));

  await css('color: red; width: 120px;');
  expect(target.style.color).toBe('red');
  expect(target.style.width).toBe('120px');
  await css('color: blue; width: invalid;');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelector('textarea')!.value).toContain('invalid');
  expect(target.style.color).toBe('red');
  await act(async () => root.render(<Harness tool="move" />));
  const move = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.move-element"]'
  )!;
  await act(async () =>
    move.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight', shiftKey: true })
    )
  );
  await act(async () =>
    move.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))
  );
  expect(target.style.translate).toBe('10px 1px');
  await act(async () =>
    move.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', ctrlKey: true })
    )
  );
  expect(target.style.translate).toBe('10px 1px');
});

it('commits one pointer gesture and restores the exact prior inline value on cancellation', async () => {
  await act(async () => root.render(<Harness tool="move" />));
  const move = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.move-element"]'
  )!;
  Object.defineProperty(move, 'setPointerCapture', { value: vi.fn() });
  Object.defineProperty(move, 'releasePointerCapture', { value: vi.fn() });
  await act(async () => pointer(move, 'pointerdown', 10, 20, 1, 2));
  await act(async () => pointer(move, 'pointerdown', 10, 20));
  await act(async () => pointer(move, 'pointermove', 99, 99, 2));
  await act(async () => pointer(move, 'pointermove', 25, 30));
  expect(target.style.translate).toBe('15px 10px');
  await act(async () => pointer(move, 'pointercancel', 25, 30));
  expect(target.style.translate).toBe('');
  await act(async () => pointer(move, 'pointerdown', 10, 20));
  await act(async () => pointer(move, 'pointermove', 30, 40));
  await act(async () => pointer(move, 'pointerup', 30, 40, 2));
  await act(async () => pointer(move, 'pointerup', 30, 40));
  expect(target.style.translate).toBe('20px 20px');
  await act(async () => pagePreparationHistory.undo());
  expect(target.style.translate).toBe('');
});

it('preserves source and draft when a chosen target disappears and releases comparison on disable', async () => {
  await act(async () => root.render(<Harness />));
  const field = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      'color: red;'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  target.remove();
  await act(async () => root.render(<Harness />));
  expect(host.querySelector('textarea')?.value).toBe('color: red;');
  expect(host.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);
  expect(target.style.color).toBe('');
  await expect(tools.apply([{ property: 'color', value: 'blue' }])).rejects.toThrow();
  await act(async () => root.render(<Harness enabled={false} />));
  await expect(tools.apply([{ property: 'color', value: 'blue' }])).rejects.toThrow();
  await act(async () => root.render(<Harness selected={false} />));
  expect(host.querySelector('[data-ui="content.design-review.settings-tools"]')).toBeNull();
});

it('keeps non-pixel positioning unchanged', async () => {
  target.style.translate = '10%';
  target.textContent = '';
  target.tabIndex = 2;
  await act(async () => root.render(<Harness tool="move" />));
  const move = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.move-element"]'
  )!;
  expect(move.disabled).toBe(true);
  expect(target.style.translate).toBe('10%');
});

it('restores important translation without a residual report change after pointercancel', async () => {
  target.style.setProperty('translate', '10px 0px', 'important');
  await act(async () => root.render(<Harness tool="move" />));
  const move = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.move-element"]'
  )!;
  Object.defineProperty(move, 'setPointerCapture', { value: vi.fn() });
  Object.defineProperty(move, 'releasePointerCapture', { value: vi.fn() });
  await act(async () => pointer(move, 'pointerdown', 10, 20));
  await act(async () => pointer(move, 'pointermove', 25, 30));
  await act(async () => pointer(move, 'pointercancel', 25, 30));
  expect(target.style.getPropertyValue('translate')).toBe('10px 0px');
  expect(target.style.getPropertyPriority('translate')).toBe('important');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(0);
});

it('cancels only the current CSS focus edit and leaves the saved per-target draft', async () => {
  await act(async () => root.render(<Harness />));
  const field = host.querySelector('textarea')!;
  await act(async () => {
    tools.cssDrafts.write(target, 'Target', 'color: red;');
  });
  await act(async () => field.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      'color: red; width: 144px;'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => expect(tools.cssDrafts.cancelEditing()).toBe(true));
  expect(field.value).toBe('color: red;');
  expect(document.activeElement).not.toBe(field);
});

it('restores the original moved target on retarget without changing the new target', async () => {
  target.style.translate = '10px 0px';
  await act(async () => root.render(<Harness tool="move" />));
  const handle = host.querySelector<HTMLElement>('[data-ui="content.design-review.move-element"]')!;
  await act(async () => pointer(handle, 'pointerdown', 10, 20));
  await act(async () => pointer(handle, 'pointermove', 30, 40));
  const original = target;
  expect(original.style.translate).toBe('30px 20px');
  const next = document.createElement('button');
  next.style.translate = '200px 100px';
  Object.defineProperty(next, 'getClientRects', {
    value: () => [DOMRect.fromRect({ width: 100, height: 40 })],
  });
  Object.defineProperty(next, 'getBoundingClientRect', {
    value: () => DOMRect.fromRect({ width: 100, height: 40 }),
  });
  document.body.append(next);
  target = next;
  await act(async () => root.render(<Harness tool="move" />));
  expect(original.style.translate).toBe('10px 0px');
  expect(next.style.translate).toBe('200px 100px');
});

it('does not overwrite a foreign translate change when the current gesture is cancelled', async () => {
  target.style.translate = '10px 0px';
  await act(async () => root.render(<Harness tool="move" />));
  const handle = host.querySelector<HTMLElement>('[data-ui="content.design-review.move-element"]')!;
  await act(async () => pointer(handle, 'pointerdown', 10, 20));
  await act(async () => pointer(handle, 'pointermove', 30, 40));
  target.style.setProperty('translate', '70px 80px', 'important');
  await act(async () => window.dispatchEvent(new Event('scroll')));
  expect(target.style.translate).toBe('70px 80px');
  expect(target.style.getPropertyPriority('translate')).toBe('important');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
