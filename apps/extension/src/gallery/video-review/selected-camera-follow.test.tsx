// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewSelectedProperties } from './selected-properties';
import { ReviewZoomPreview } from './zoom-preview';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import { createQuickEditBorder } from '../../features/video/review/advanced/border';

const preview = vi.hoisted(() => vi.fn());
vi.mock('./zoom-preview', () => ({
  ReviewZoomPreview: (props: unknown) => {
    preview(props);
    return null;
  },
}));
vi.mock('./use-zoom-preview-source', () => ({ useZoomPreviewSource: () => null }));
vi.mock('./advanced-panels', () => ({
  ReviewAdvancedPanels: (props: {
    advanced: ReturnType<typeof createQuickEditAdvancedState>;
    zoomPreview(region: unknown): unknown;
  }) => props.zoomPreview(props.advanced.zoom.regions[0]),
}));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  preview.mockClear();
  vi.unstubAllGlobals();
});

it.each([
  { followCursor: true, playing: false },
  { followCursor: false, playing: false },
  { followCursor: undefined, playing: false },
  { followCursor: true, playing: true },
  { followCursor: true, playing: false, type: 'spotlight' },
  { followCursor: true, playing: false, type: 'border' },
  { followCursor: true, playing: true, type: 'link' },
])(
  'maps the selected camera preview through edits and local policy $followCursor, playing=$playing',
  ({ followCursor, playing, type }) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const advanced = createQuickEditAdvancedState();
    advanced.ui.mode = 'advanced';
    advanced.ui.tracks.zoom = true;
    advanced.zoom.enabled = true;
    advanced.cursorFocusPath = {
      version: 1,
      smoothing: 0.5,
      sensitivity: 0.5,
      mode: 'follow',
      gapPolicy: 'hold',
      segments: [],
    };
    advanced.cursorFocusPath.segments = [
      {
        id: 'path',
        binding: { kind: 'project' },
        start: 0,
        end: 8,
        keys: [
          {
            id: 'key',
            time: 1,
            x: 0.2,
            y: 0.3,
            anchor: 'manual',
            authored: true,
            interpolation: 'smooth',
          },
        ],
      },
    ];
    const region = {
      ...createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 2, endMax: 8 }),
      ...(followCursor === undefined ? {} : { followCursor }),
      ...(type === 'spotlight' ? { spotlight: createQuickEditSpotlight() } : {}),
      ...(type === 'border' ? { border: createQuickEditBorder() } : {}),
    };
    advanced.zoom.regions = [region];
    const props = {
      advanced,
      selection: { kind: type === 'link' ? 'zoom-link' : 'zoom', id: region.id },
      busy: false,
      resource: {
        file: null,
        telemetry: null,
        source: { duration: 8, width: 640, height: 360 },
        session: {
          getSnapshot: () => ({
            document: { edits: [{ id: 'speed', kind: 'speed', start: 0, end: 8, rate: 2 }] },
          }),
        },
      },
      editing: { exporter: { phase: 'idle', index: null } },
      zoom: {
        previewRegion: (item: typeof region) => item,
        revision: () => 'revision',
        changeAtRevision: vi.fn(),
        previewAtRevision: vi.fn(),
      },
      ...(playing
        ? { playback: { camera: region.transform }, ...(type === 'link' ? {} : { focusTime: 1.5 }) }
        : {}),
      toSourceTime: (time: number) => time * 2,
    } as unknown as ComponentProps<typeof ReviewSelectedProperties>;
    const root = createRoot(document.createElement('div'));
    dispose = () => act(() => root.unmount());
    act(() => root.render(<ReviewSelectedProperties {...props} />));
    const selected = preview.mock.lastCall![0] as ComponentProps<typeof ReviewZoomPreview>;
    expect(selected.cursorFollowing).toBe(
      type === 'spotlight' || type === 'border' ? false : (followCursor ?? true)
    );
    expect(selected.focus?.regions[0]?.cursorFocus?.path.mode).toBe(
      followCursor === false ? undefined : 'follow'
    );
    if (followCursor === false) expect(selected.focus?.regions[0]?.cursorFocus).toBeUndefined();
    else expect(selected.focus?.regions[0]?.cursorFocus?.timeMap?.[0]).toMatchObject({ rate: 2 });
    expect(selected.focus?.time).toBe(playing && type !== 'link' ? 1.5 : 1);
    expect(advanced.cursorFocusPath.mode).toBe('follow');
    preview.mockClear();
    act(() => root.render(<ReviewSelectedProperties {...props} selection={{ kind: 'none' }} />));
    expect(preview).not.toHaveBeenCalled();
  }
);
