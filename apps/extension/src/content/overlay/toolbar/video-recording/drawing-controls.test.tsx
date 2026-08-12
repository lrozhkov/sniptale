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
  expect(host.querySelector('[data-ui="content.toolbar.drawing-actions-group"]')).toBeNull();

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
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.video-recording.auto-hide-5"]')
      ?.click()
  );
  expect(owner.getAutoHideDelay()).toBe(5);

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
