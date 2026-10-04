// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { resolveTimelineTrackLayoutModel } from '../../tracks/layout';
import { createTimelineProjection } from '../../interaction-state/projection';
import { useTrackMaterialDrop } from './material-drop';
import type { useMaterialDrag } from '../../../../chrome/material-drag';

const mock = vi.hoisted(() => ({ session: null as ReturnType<typeof useMaterialDrag> | null }));
vi.mock('../../../../chrome/material-drag', () => ({ useMaterialDrag: () => mock.session }));
const container = document.createElement('div');
let root = createRoot(container);
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(container);
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const project = createEmptyVideoProject('Drop');
  const asset = createVideoProjectAsset(
    'Media',
    'IMAGE',
    { kind: 'project-asset', projectAssetId: 'asset' },
    {
      duration: null,
      width: 100,
      height: 100,
      size: 1,
      mimeType: 'image/png',
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  const track = project.tracks[0]!;
  track.logicalLanes = [{ id: 'line-1' }, { id: 'line-2' }];
  const layout = resolveTimelineTrackLayoutModel({
    project,
    tracks: project.tracks,
    trackHeightByTrackId: {},
    trackLayoutModel: undefined,
  });
  const trackLayout = layout.layoutByTrackId.get(track.id)!;
  mock.session = {
    drag: { assetId: asset.id, project, token: 'token', source: document.createElement('button') },
    pending: false,
    start: vi.fn(),
    accepts: vi.fn(() => true),
    drop: vi.fn(),
  };
  function View() {
    const drop = useTrackMaterialDrop({
      project,
      trackId: track.id,
      trackLayout,
      pixelsPerSecond: 50,
      projection: createTimelineProjection({
        extentSeconds: 50,
        pixelsPerSecond: 50,
        viewportWidth: 500,
        startTime: 10,
      }),
    });
    return (
      <div onDragOver={drop.onDragOver} onDragLeave={drop.onDragLeave} onDrop={drop.onDrop}>
        {drop.preview}
      </div>
    );
  }
  const render = () => act(() => root.render(<View />));
  render();
  const lane = container.firstElementChild as HTMLDivElement;
  lane.getBoundingClientRect = () => ({ left: 100, top: 20 }) as DOMRect;
  const transfer = { dropEffect: 'none' };
  const dispatch = (
    type: string,
    y = trackLayout.logicalLaneMetrics.get('line-1')!.rowTop + 22
  ) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientX: { value: 200 },
      clientY: { value: y },
      dataTransfer: { value: transfer },
    });
    act(() => lane.dispatchEvent(event));
    return event;
  };
  return { project, track, dispatch, transfer, render };
}
it('previews source duration at scrolled time on the hovered logical lane and commits the same target', () => {
  const { track, dispatch, transfer } = setup();
  expect(dispatch('dragover').defaultPrevented).toBe(true);
  expect(transfer.dropEffect).toBe('copy');
  const preview = container.querySelector<HTMLElement>(
    '[data-ui="timeline.material-drop-preview"]'
  )!;
  expect(preview.style.left).toBe('100px');
  expect(preview.style.width).toBe('250px');
  dispatch('drop');
  expect(mock.session!.drop).toHaveBeenCalledExactlyOnceWith({
    trackId: track.id,
    startTime: 12,
    timelineLaneId: 'line-1',
  });
  expect(container.querySelector('[data-ui="timeline.material-drop-preview"]')).toBeNull();
});
it.each(['locked', 'audio', 'outside-lane', 'foreign'])(
  'rejects %s destinations and clears the preview',
  (invalid) => {
    const { track, dispatch, transfer } = setup();
    dispatch('dragover');
    if (invalid === 'locked') track.locked = true;
    if (invalid === 'audio') track.kind = 'AUDIO';
    if (invalid === 'foreign') mock.session!.accepts = () => false;
    const y = invalid === 'outside-lane' ? -1 : undefined;
    expect(dispatch('dragover', y).defaultPrevented).toBe(false);
    expect(transfer.dropEffect).toBe('none');
    dispatch('drop', y);
    expect(mock.session!.drop).not.toHaveBeenCalled();
    expect(container.querySelector('[data-ui="timeline.material-drop-preview"]')).toBeNull();
  }
);
it('removes preview on leaving and session cancellation', () => {
  const { dispatch, render } = setup();
  dispatch('dragover');
  dispatch('dragleave');
  expect(container.querySelector('[data-ui="timeline.material-drop-preview"]')).toBeNull();
  dispatch('dragover');
  mock.session!.drag = null;
  render();
  expect(container.querySelector('[data-ui="timeline.material-drop-preview"]')).toBeNull();
});
