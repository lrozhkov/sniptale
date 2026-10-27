// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import {
  createScaledFrameAnnotationCoordinateSpace,
  identityFrameAnnotationCoordinateSpace,
} from '../../features/highlighter/frame-annotation/coordinate-space';
import { createFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import { createFrameAnnotationProxy } from './proxy';
import { FrameProjection } from './projection';
import { FrameProjectionReadOnlyOverlays } from './projection-read-only';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../../features/highlighter/style/defaults';

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

it.each([0.5, 2])('keeps resize handles below the number at zoom %s', (scale) => {
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  const sceneRoot = document.createElement('div');
  document.body.append(host, controlsRoot, sceneRoot);
  const root = createRoot(host);
  const snapshot = createFrameAnnotationSnapshot(
    {
      id: 'numbered-frame',
      x: 100,
      y: 100,
      width: 240,
      height: 160,
      stepBadge: { ...createDefaultFrameStepBadge(), enabled: true },
    },
    0
  );
  const object = createFrameAnnotationProxy({ frame: snapshot, label: 'Frame', ordering: 0 });
  const onResizeStart = vi.fn();
  act(() =>
    root.render(
      <FrameProjection
        coordinateSpace={createScaledFrameAnnotationCoordinateSpace({
          origin: { x: 20, y: 30 },
          scale,
          viewport: { width: 1000, height: 800 },
        })}
        controlsRoot={controlsRoot}
        sceneRoot={sceneRoot}
        interactive
        object={object}
        selected
        scale={scale}
        snapshot={snapshot}
        settingsAnchor={null}
        settingsMenu={null}
        onCommand={vi.fn()}
        onDraftCommit={vi.fn()}
        onCloseSettings={vi.fn()}
        onOpenSettings={vi.fn()}
        onMoveStart={vi.fn()}
        onResizeStart={onResizeStart}
        onSnapshotChange={vi.fn()}
        onSnapshotPreview={vi.fn()}
        onStepBadgeReorder={vi.fn()}
      />
    )
  );
  const handle = sceneRoot.querySelector<HTMLElement>(
    '[data-frame-control="resize-handle"][data-direction="se"]'
  );
  const badgeLayer = sceneRoot.querySelector<HTMLElement>('.sniptale-step-badge-layer');
  expect(handle).not.toBeNull();
  expect(badgeLayer).not.toBeNull();
  expect(Number(handle!.parentElement!.style.zIndex)).toBeLessThan(
    Number(badgeLayer!.style.zIndex)
  );
  expect(handle!.style.position).toBe('absolute');
  expect(handle!.parentElement!.style.transform).toBe(`scale(${1 / scale})`);
  expect(handle!.style.width).toBe('11px');
  act(() => handle!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(onResizeStart).toHaveBeenCalledWith(expect.anything(), 'se', null);
  act(() => root.unmount());
  document.body.replaceChildren();
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

it('keeps a frame comment and number visible but not editable during canvas crop', async () => {
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  const sceneRoot = document.createElement('div');
  document.body.append(host, controlsRoot, sceneRoot);
  const root = createRoot(host);
  const snapshot = createFrameAnnotationSnapshot(
    {
      id: 'frame-crop',
      x: 40,
      y: 40,
      width: 200,
      height: 120,
      borderSettings: {
        ...projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET),
        fillPaint: { kind: 'solid', color: '#ff0000' },
        shadow: 6,
      },
      callout: {
        ...createDefaultFrameCallout(),
        enabled: true,
        content: { bodyHtml: 'Visible comment', titleText: '' },
      },
      stepBadge: {
        ...createDefaultFrameStepBadge(),
        enabled: true,
        value: '7',
        auto: false,
        style: {
          ...createDefaultFrameStepBadge().style,
          backgroundColorSource: 'frame-fill',
        },
      },
    },
    0
  );
  const object = createFrameAnnotationProxy({ frame: snapshot, label: 'Frame', ordering: 0 });

  await act(async () =>
    root.render(
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={controlsRoot}
        interactive={false}
        showVisualOverlays
        object={object}
        sceneRoot={sceneRoot}
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

  expect(sceneRoot.textContent).toContain('Visible comment');
  expect(sceneRoot.textContent).toContain('7');
  const badge = sceneRoot.querySelector<HTMLElement>('.sniptale-step-badge');
  expect(badge?.style.backgroundColor).toBe('rgb(255, 0, 0)');
  expect(badge?.style.boxShadow).not.toBe('');
  expect(controlsRoot.childElementCount).toBe(0);
  act(() => root.unmount());
  document.body.replaceChildren();
});

it('keeps the crop-mode comment bubble at its logical size when the scene is zoomed out', async () => {
  const host = document.createElement('div');
  const sceneRoot = document.createElement('div');
  sceneRoot.style.transform = 'scale(0.5)';
  document.body.append(host, sceneRoot);
  const root = createRoot(host);
  const defaultCallout = createDefaultFrameCallout();
  const snapshot = createFrameAnnotationSnapshot(
    {
      id: 'frame-scaled-crop',
      x: 40,
      y: 40,
      width: 200,
      height: 120,
      callout: {
        ...defaultCallout,
        content: { bodyHtml: 'Visible comment', titleText: '' },
      },
    },
    0
  );
  const object = createFrameAnnotationProxy({ frame: snapshot, label: 'Frame', ordering: 0 });
  const originalGetBoundingClientRect = HTMLDivElement.prototype.getBoundingClientRect;
  const measure = vi
    .spyOn(HTMLDivElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLDivElement) {
      if (
        this.parentElement?.classList.contains('sniptale-callout') &&
        this.querySelector('[data-sniptale-callout-body-layout]')
      ) {
        return DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 40 });
      }
      return originalGetBoundingClientRect.call(this);
    });

  try {
    await act(async () =>
      root.render(
        <FrameProjection
          coordinateSpace={createScaledFrameAnnotationCoordinateSpace({
            origin: { x: 0, y: 0 },
            scale: 0.5,
            viewport: { width: 800, height: 600 },
          })}
          controlsRoot={null}
          interactive={false}
          showVisualOverlays
          object={object}
          sceneRoot={sceneRoot}
          selected={false}
          scale={0.5}
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
    const surface = sceneRoot.querySelector<HTMLElement>(
      '[data-ui="content.callout.surface-compositor"]'
    );
    expect(surface?.style.width).toBe('204px');
    expect(Number.parseFloat(surface?.style.height ?? '')).toBeGreaterThan(90);
  } finally {
    act(() => root.unmount());
    measure.mockRestore();
    document.body.replaceChildren();
  }
});

it('omits disabled frame visuals and tolerates an unavailable crop scene', async () => {
  const host = document.createElement('div');
  const sceneRoot = document.createElement('div');
  document.body.append(host, sceneRoot);
  const root = createRoot(host);
  const snapshot = createFrameAnnotationSnapshot(
    {
      id: 'frame-disabled',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      callout: { ...createDefaultFrameCallout(), enabled: false },
      stepBadge: { ...createDefaultFrameStepBadge(), enabled: false },
    },
    0
  );
  const props = {
    coordinateSpace: identityFrameAnnotationCoordinateSpace,
    controlsRoot: null,
    scene: { borderColor: '#000', borderWidth: 1 } as never,
    snapshot,
  };

  await act(async () =>
    root.render(<FrameProjectionReadOnlyOverlays {...props} sceneRoot={null} />)
  );
  expect(sceneRoot.childElementCount).toBe(0);
  await act(async () =>
    root.render(<FrameProjectionReadOnlyOverlays {...props} sceneRoot={sceneRoot} />)
  );
  expect(sceneRoot.childElementCount).toBe(0);
  act(() => root.unmount());
  document.body.replaceChildren();
});

it('focuses a new empty comment without opening its style settings', async () => {
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  const sceneRoot = document.createElement('div');
  document.body.append(host, controlsRoot, sceneRoot);
  const root = createRoot(host);
  const initial = createFrameAnnotationSnapshot(
    {
      id: 'frame-new-comment',
      x: 100,
      y: 100,
      width: 240,
      height: 160,
      callout: {
        ...createDefaultFrameCallout(),
        enabled: true,
        content: { bodyHtml: 'Existing comment', titleText: '' },
      },
    },
    0
  );
  const object = createFrameAnnotationProxy({ frame: initial, label: 'Frame', ordering: 0 });
  const onOpenSettings = vi.fn();
  function Harness() {
    const [snapshot, setSnapshot] = useState(initial);
    return (
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={controlsRoot}
        sceneRoot={sceneRoot}
        interactive
        object={object}
        selected
        scale={1}
        snapshot={snapshot}
        settingsAnchor={null}
        settingsMenu={null}
        onCommand={vi.fn()}
        onDraftCommit={vi.fn()}
        onCloseSettings={vi.fn()}
        onOpenSettings={onOpenSettings}
        onMoveStart={vi.fn()}
        onResizeStart={vi.fn()}
        onSnapshotChange={setSnapshot}
        onSnapshotPreview={setSnapshot}
        onStepBadgeReorder={vi.fn()}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  await act(async () =>
    controlsRoot
      .querySelector<HTMLButtonElement>('[data-ui="content.interactive-frame.add-callout"]')!
      .click()
  );
  const comments = sceneRoot.querySelectorAll<HTMLElement>('[contenteditable]');
  expect(comments).toHaveLength(2);
  expect(comments[1]!.getAttribute('contenteditable')).toBe('true');
  expect(document.activeElement).toBe(comments[1]);
  expect(onOpenSettings).not.toHaveBeenCalled();
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

  try {
    await act(async () => root.render(<Harness />));
    const editable = sceneRoot.querySelector<HTMLElement>('[contenteditable]');
    expect(editable?.style.fontFamily).toContain('system-ui');

    const serif = document.querySelector<HTMLButtonElement>('[role="group"] button[title="Serif"]');
    expect(serif).toBeDefined();
    await act(async () => serif?.click());

    expect(sceneRoot.querySelector<HTMLElement>('[contenteditable]')?.style.fontFamily).toContain(
      'Georgia'
    );
  } finally {
    act(() => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

it('keeps a selected standalone badge editable without frame resize or effect controls', () => {
  const host = document.createElement('div');
  const controlsRoot = document.createElement('div');
  const sceneRoot = document.createElement('div');
  document.body.append(host, controlsRoot, sceneRoot);
  const root = createRoot(host);
  const snapshot = createFrameAnnotationSnapshot(
    {
      id: 'standalone',
      annotationKind: 'step-badge',
      x: 120,
      y: 80,
      width: 1,
      height: 1,
      stepBadge: createDefaultFrameStepBadge(),
    },
    0
  );
  act(() =>
    root.render(
      <FrameProjection
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsRoot={controlsRoot}
        interactive
        object={null}
        sceneRoot={sceneRoot}
        selected
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
  expect(controlsRoot.querySelector('.sniptale-action-toolbar')).toBeNull();
  expect(sceneRoot.querySelector('.sniptale-resize-handle')).toBeNull();
  expect(sceneRoot.querySelector('.sniptale-step-badge')).not.toBeNull();
  expect(controlsRoot.querySelector('.sniptale-step-badge-settings-handle')).not.toBeNull();
  act(() => root.unmount());
  host.remove();
  controlsRoot.remove();
  sceneRoot.remove();
});
