// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { identityFrameAnnotationCoordinateSpace } from '../../features/highlighter/frame-annotation/coordinate-space';
import { createFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import { createFrameAnnotationProxy } from './proxy';
import { FrameProjection } from './projection';

vi.mock('../../composition/frame-annotation-controls/callout/preset-controller', () => ({
  useCalloutPresetPopoverController: () => ({
    catalog: {
      create: vi.fn(),
      error: null,
      isSaving: false,
      overwrite: vi.fn(),
      pendingPresetIds: new Set(),
      presets: [],
      refresh: vi.fn(),
      toggle: vi.fn(),
      visiblePresets: [],
    },
    editor: {
      close: vi.fn(),
      isOpen: false,
      isSaving: false,
      open: vi.fn(),
      preset: undefined,
      reset: vi.fn(),
      save: vi.fn(),
    },
  }),
}));

it('projects logical frame geometry with CSS left and top coordinates', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const snapshot = createFrameAnnotationSnapshot(
    { id: 'frame-1', x: 125, y: 84, width: 240, height: 160, effectMode: 'border' },
    0
  );

  act(() =>
    root.render(
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={null}
        interactive
        object={null}
        sceneRoot={null}
        selected={false}
        scale={1}
        snapshot={snapshot}
        settingsAnchor={null}
        settingsMenu={null}
        onCommand={vi.fn()}
        onDraftCommit={vi.fn()}
        onCloseSettings={vi.fn()}
        onOpenSettings={vi.fn()}
        onMoveStart={vi.fn()}
        onResizeStart={vi.fn()}
        onSnapshotChange={vi.fn()}
        onSnapshotPreview={vi.fn()}
        onStepBadgeReorder={vi.fn()}
      />
    )
  );

  expect(host.querySelector<HTMLElement>('[data-frame-id="frame-1"]')?.style).toMatchObject({
    left: '125px',
    top: '84px',
    width: '240px',
    height: '160px',
  });
  act(() => root.unmount());
  host.remove();
});

it('does not mount any interactive overlay for a locked selected frame', () => {
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  const sceneRoot = document.createElement('div');
  document.body.append(host, controlsRoot, sceneRoot);
  const root = createRoot(host);
  const snapshot = createFrameAnnotationSnapshot(
    {
      id: 'frame-locked',
      x: 40,
      y: 40,
      width: 200,
      height: 120,
      callout: { ...createDefaultFrameCallout(), enabled: true },
      stepBadge: { ...createDefaultFrameStepBadge(), enabled: true },
    },
    0
  );
  const object = createFrameAnnotationProxy({
    frame: snapshot,
    label: 'Locked frame',
    ordering: 0,
  });
  object.sniptaleLocked = true;

  act(() =>
    root.render(
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={controlsRoot}
        interactive={false}
        object={object}
        sceneRoot={sceneRoot}
        selected
        scale={1}
        snapshot={snapshot}
        settingsAnchor={document.createElement('button')}
        settingsMenu="callout"
        onCommand={vi.fn()}
        onDraftCommit={vi.fn()}
        onCloseSettings={vi.fn()}
        onOpenSettings={vi.fn()}
        onMoveStart={vi.fn()}
        onResizeStart={vi.fn()}
        onSnapshotChange={vi.fn()}
        onSnapshotPreview={vi.fn()}
        onStepBadgeReorder={vi.fn()}
      />
    )
  );

  expect(controlsRoot.childElementCount).toBe(0);
  expect(sceneRoot.childElementCount).toBe(0);
  expect(host.querySelector('[data-frame-control="resize-handle"]')).toBeNull();
  act(() => root.unmount());
  document.body.replaceChildren();
});

it('projects a font selected in shared callout settings into the editor DOM surface', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  const sceneRoot = document.createElement('div');
  const anchor = document.createElement('button');
  document.body.append(host, controlsRoot, sceneRoot, anchor);
  const root = createRoot(host);
  const initial = createFrameAnnotationSnapshot(
    {
      id: 'frame-font',
      x: 125,
      y: 84,
      width: 240,
      height: 160,
      callout: {
        ...createDefaultFrameCallout(),
        content: { bodyHtml: '6867', titleText: '' },
        sourcePresetId: undefined,
      },
    },
    0
  );
  const object = createFrameAnnotationProxy({
    frame: initial,
    label: 'Frame annotation font',
    ordering: 0,
  });

  function Harness() {
    const [snapshot, setSnapshot] = useState(initial);
    return (
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={controlsRoot}
        interactive
        object={object}
        sceneRoot={sceneRoot}
        selected
        scale={1}
        snapshot={snapshot}
        settingsAnchor={anchor}
        settingsMenu="callout"
        onCommand={vi.fn()}
        onDraftCommit={vi.fn()}
        onCloseSettings={vi.fn()}
        onOpenSettings={vi.fn()}
        onMoveStart={vi.fn()}
        onResizeStart={vi.fn()}
        onSnapshotChange={setSnapshot}
        onSnapshotPreview={setSnapshot}
        onStepBadgeReorder={vi.fn()}
      />
    );
  }

  await act(async () => root.render(<Harness />));
  const editable = sceneRoot.querySelector<HTMLElement>('[contenteditable]');
  expect(editable?.style.fontFamily).toContain('system-ui');

  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[data-ui="shared.ui.compact-select"] > button')
      ?.click()
  );
  const serif = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')][1];
  expect(serif).toBeDefined();
  await act(async () => serif?.click());

  expect(sceneRoot.querySelector<HTMLElement>('[contenteditable]')?.style.fontFamily).toContain(
    'Georgia'
  );
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
