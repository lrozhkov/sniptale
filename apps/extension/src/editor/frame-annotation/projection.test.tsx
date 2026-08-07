// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { identityFrameAnnotationCoordinateSpace } from '../../features/highlighter/frame-annotation/coordinate-space';
import { createFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';
import { FrameProjection } from './projection';

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
