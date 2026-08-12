// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ToolbarDrawingControls } from '../controls/drawing';
import { RecordingDrawingControls, type RecordingDrawingInteractionMode } from './drawing-controls';
import { createRecordingDrawingOwner } from './drawing-session';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reuses the complete drawing catalog while recording owns navigation, eraser, and actions', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const owner = createRecordingDrawingOwner();
  owner.controller.session.commitObject({
    id: 'box',
    kind: 'blur',
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onAutoHideDelayChange = vi.fn();
  function Harness() {
    const [mode, setMode] = useState<RecordingDrawingInteractionMode>('navigation');
    return (
      <RecordingDrawingControls
        compactMenus={false}
        displayMode="horizontal"
        interactionMode={mode}
        owner={owner}
        onAutoHideDelayChange={onAutoHideDelayChange}
        onInteractionModeChange={setMode}
      />
    );
  }
  act(() => root.render(<Harness />));

  expect(
    host.querySelectorAll(
      'button[data-ui^="content.toolbar.drawing."]:not([data-ui^="content.toolbar.drawing-options."])'
    )
  ).toHaveLength(7);
  expect(
    host
      .querySelector('[data-ui="content.toolbar.video-recording.navigation"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(host.querySelector('[data-ui="content.toolbar.drawing-actions-group"]')).not.toBeNull();

  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.arrow"]')?.click()
  );
  expect(owner.controller.session.getSnapshot().activeTool).toBe('arrow');
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.arrow"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing-actions-group"]')).not.toBeNull();
  expect(
    host.querySelector('[data-ui="content.toolbar.video-recording.auto-hide"]')
  ).not.toBeNull();

  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.eraser"]')
      ?.click()
  );
  expect(
    host
      .querySelector('[data-ui="content.toolbar.video-recording.eraser"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.arrow"]')).toBeNull();

  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.auto-hide"]')
      ?.click()
  );
  expect(
    host.querySelector('[data-ui="content.toolbar.video-recording.auto-hide-menu"]')
  ).not.toBeNull();
  expect(host.querySelector<HTMLElement>('.sniptale-popover-menu')?.style.top).toBe(
    'calc(100% + 10px)'
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.auto-hide-5"]')
      ?.click()
  );
  expect(owner.getAutoHideDelay()).toBe(0);
  expect(onAutoHideDelayChange).toHaveBeenCalledWith(5);

  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.clear"]')
      ?.click()
  );
  expect(owner.controller.session.getSnapshot().document.objects).toEqual([]);
  act(() => root.unmount());
  owner.dispose();
});

it('keeps the page-preparation owner contract optional and does not change its toolbar structure', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const owner = createRecordingDrawingOwner();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={owner.controller} displayMode="horizontal" />)
  );

  expect([...host.children].map((element) => element.getAttribute('data-ui'))).toEqual([
    'content.toolbar.drawing-tools-group',
    'content.toolbar.drawing-actions-divider',
    'content.toolbar.drawing-actions-group',
  ]);
  expect(host.querySelector('[data-ui="content.toolbar.video-recording.navigation"]')).toBeNull();
  act(() => root.unmount());
  owner.dispose();
});

it('keeps recording tool options collapsed across tool switches until explicitly reopened', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const owner = createRecordingDrawingOwner();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [mode, setMode] = useState<RecordingDrawingInteractionMode>('navigation');
    return (
      <RecordingDrawingControls
        compactMenus={false}
        displayMode="horizontal"
        interactionMode={mode}
        owner={owner}
        onInteractionModeChange={setMode}
      />
    );
  }
  act(() => root.render(<Harness />));

  const clickTool = (tool: string) =>
    act(() =>
      host.querySelector<HTMLButtonElement>(`[data-ui="content.toolbar.drawing.${tool}"]`)?.click()
    );
  clickTool('pencil');
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')).not.toBeNull();
  clickTool('pencil');
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')).toBeNull();
  clickTool('shape');
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.shape"]')).toBeNull();
  clickTool('shape');
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.shape"]')).not.toBeNull();

  act(() => root.unmount());
  owner.dispose();
});

it('does not let the recording eraser capture toolbar or popover pointer gestures', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const owner = createRecordingDrawingOwner();
  const host = document.createElement('div');
  host.className = 'sniptale-app';
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RecordingDrawingControls
        compactMenus={false}
        displayMode="horizontal"
        interactionMode="eraser"
        owner={owner}
        onInteractionModeChange={vi.fn()}
      />
    )
  );

  const toolbarButton = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.video-recording.auto-hide"]'
  )!;
  const toolbarPointerDown = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 10,
    clientY: 10,
  });
  Object.defineProperty(toolbarPointerDown, 'pointerId', { value: 1 });
  expect(toolbarButton.dispatchEvent(toolbarPointerDown)).toBe(true);

  const pageTarget = document.createElement('div');
  document.body.append(pageTarget);
  const pagePointerDown = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: 20,
    clientY: 20,
  });
  Object.defineProperty(pagePointerDown, 'pointerId', { value: 2 });
  expect(pageTarget.dispatchEvent(pagePointerDown)).toBe(false);

  act(() => root.unmount());
  owner.dispose();
});
