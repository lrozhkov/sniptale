// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  editingArgs: vi.fn(),
  surfaceProps: vi.fn(),
}));

vi.mock('../../features/highlighter/frame-annotation/callout/editing', () => ({
  useFrameCalloutEditing: (args: { isEditing: boolean }) => {
    mocks.editingArgs(args);
    return {
      events: {
        applyFormatting: vi.fn(),
        blur: vi.fn(),
        click: vi.fn(),
        input: vi.fn(),
        keyDown: vi.fn(),
        paste: vi.fn(),
      },
      layout: {
        dimensions: { height: 80, width: 160 },
        floatingToolbarRect: { bottom: 20, left: 10, right: 30, top: 10 },
      },
      refs: { container: { current: null }, contentEditable: { current: null } },
    };
  },
}));
vi.mock(
  '../../features/highlighter/frame-annotation/callout/interactive-surface',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../features/highlighter/frame-annotation/callout/interactive-surface')
    >()),
    FrameCalloutInteractiveSurface: (props: {
      editing: { layout: { floatingToolbarRect: unknown } };
      isEditing: boolean;
    }) => {
      mocks.surfaceProps(props);
      return null;
    },
  })
);
vi.mock('../../composition/frame-annotation-controls/callout/popover', () => ({
  FutureCalloutSettingsPopover: () => null,
}));

import { createFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';
import { createDefaultFrameCallout } from '../../features/highlighter/frame-annotation/defaults';
import { identityFrameAnnotationCoordinateSpace } from '../../features/highlighter/frame-annotation/coordinate-space';
import { createFrameAnnotationProxy } from './proxy';
import { EditorFrameCallout } from './callout-projection';

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it('starts a newly enabled empty comment in editing mode and suppresses formatting chrome', () => {
  const snapshot = createFrameAnnotationSnapshot(
    {
      callout: createDefaultFrameCallout(),
      height: 120,
      id: 'frame-1',
      width: 200,
      x: 20,
      y: 30,
    },
    0
  );
  const object = createFrameAnnotationProxy({ frame: snapshot, label: 'Frame 1', ordering: 0 });
  const host = document.createElement('div');
  const scene = document.createElement('div');
  document.body.append(host, scene);
  const root = createRoot(host);

  act(() =>
    root.render(
      <EditorFrameCallout
        coordinateSpace={identityFrameAnnotationCoordinateSpace}
        controlsPortalTarget={null}
        object={object}
        portalTarget={scene}
        selected
        snapshot={snapshot}
        isSettingsOpen
        onDraftCommit={vi.fn()}
        onSnapshotChange={vi.fn()}
        onSnapshotPreview={vi.fn()}
        onSettingsOpen={vi.fn()}
        onOccupiedBoundsChange={vi.fn()}
      />
    )
  );

  expect(mocks.editingArgs).toHaveBeenCalledWith(expect.objectContaining({ isEditing: true }));
  expect(mocks.surfaceProps).toHaveBeenCalledWith(
    expect.objectContaining({
      isEditing: true,
      isSettingsOpen: true,
      showSettingsHandle: true,
      editing: expect.objectContaining({
        layout: expect.objectContaining({ floatingToolbarRect: null }),
      }),
    })
  );
  act(() => root.unmount());
});
