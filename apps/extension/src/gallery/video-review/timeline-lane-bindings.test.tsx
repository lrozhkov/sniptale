// @vitest-environment jsdom
import { act, startTransition, Suspense, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { ReviewZoomLane, ReviewAudioLane } from './timeline-lane-bindings';
import type { ReviewZoomTrack } from './zoom-track';
import type { ReviewAudioTrack } from './audio-track';
import { ReviewWebcamTrack } from './webcam-track';
import {
  createQuickEditWebcam,
  type QuickEditWebcam,
} from '../../features/video/review/advanced/webcam';
import { createTrackProjection } from './track-projection';
import { translate } from '../../platform/i18n';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));

const observed = vi.hoisted(() => ({ zoom: vi.fn(), audio: vi.fn() }));
vi.mock('./zoom-track', () => ({
  ReviewZoomTrack: (props: ComponentProps<typeof ReviewZoomTrack>) => {
    observed.zoom(props);
    return (
      <>
        <button onClick={props.onToggleEnabled}>Toggle</button>
        <button onClick={() => props.onLink?.('first', 'next')}>Link</button>
        <button onClick={() => props.onSelectLink?.('first')}>Inspect link</button>
      </>
    );
  },
}));
vi.mock('./audio-track', () => ({
  ReviewAudioTrack: (props: ComponentProps<typeof ReviewAudioTrack>) => {
    observed.audio(props);
    return (
      <>
        <button onClick={() => props.onSelect('music')}>Select audio</button>
        <button onClick={() => props.onMoveClip('music', 'music', 1.5)}>Move audio</button>
        <button onClick={() => props.onTrimClip('music', 'music', 'end', 2)}>Trim audio</button>
      </>
    );
  },
}));

it.each([false, true])(
  'zoom result-time actions share admitted history commands, direct=%s',
  async (direct) => {
    const host = document.createElement('div'),
      root = createRoot(host);
    const commands = { toggleEnabled: vi.fn(), change: vi.fn(), setLinkSelection: vi.fn() };
    let allowed = false;
    const props = {
      compact: false,
      advanced: createQuickEditAdvancedState(),
      resultDuration: 2,
      outputTime: 1,
      edits: [],
      zoom: commands,
      toOutputTime: (source: number) => source / 2,
      ...(!direct
        ? {
            beforeAction: (action: () => void) => {
              if (allowed) action();
            },
          }
        : {}),
    } as unknown as ComponentProps<typeof ReviewZoomLane>;
    const click = async (label: string) =>
      act(async () =>
        [...host.querySelectorAll('button')].find((node) => node.textContent === label)!.click()
      );
    try {
      await act(async () => root.render(<ReviewZoomLane {...props} />));
      const lane = observed.zoom.mock.lastCall![0] as ComponentProps<typeof ReviewZoomTrack>;
      expect([lane.duration, lane.time, lane.toOutputTime!(4)]).toEqual([2, 1, 2]);
      for (const label of ['Toggle', 'Link', 'Inspect link']) await click(label);
      expect(commands.toggleEnabled).toHaveBeenCalledTimes(direct ? 1 : 0);
      if (!direct) {
        expect(commands.change).not.toHaveBeenCalled();
        expect(commands.setLinkSelection).not.toHaveBeenCalled();
        allowed = true;
        for (const label of ['Toggle', 'Link', 'Inspect link']) await click(label);
      }
      expect(commands.change).toHaveBeenCalledWith('first', { linkTo: 'next' });
      expect(commands.setLinkSelection).toHaveBeenCalledWith('first');
    } finally {
      await act(async () => root.unmount());
    }
  }
);

it('audio edits retain their result-time values and the existing lane mutation owner', async () => {
  const host = document.createElement('div'),
    root = createRoot(host);
  const audio = {
    assets: new Map(),
    selectedId: null,
    setSelectedId: vi.fn(),
    moveClip: vi.fn(),
    trimClip: vi.fn(),
    setOriginal: vi.fn(),
    toggleLaneMute: vi.fn(),
  };
  const state = createQuickEditAdvancedState().audio;
  const props = {
    audio,
    audioState: state,
    resultDuration: 3,
    edits: [],
    snapTimes: [0, 1, 3],
    busy: false,
    hasOriginalAudio: true,
    showAddedAudio: true,
    onOriginalRange: vi.fn(),
    onSelectSpeed: vi.fn(),
    onImportFile: vi.fn(),
    onRecordVoiceover: vi.fn(),
    selectedEditId: undefined,
  } as unknown as ComponentProps<typeof ReviewAudioLane>;
  try {
    await act(async () => root.render(<ReviewAudioLane {...props} />));
    const lane = observed.audio.mock.lastCall![0] as ComponentProps<typeof ReviewAudioTrack>;
    expect(lane.duration).toBe(3);
    expect(lane.audio).toBe(state);
    expect(lane.originalEditor).toBe(audio);
    for (const button of host.querySelectorAll<HTMLButtonElement>('button'))
      await act(async () => button.click());
    expect(audio.setSelectedId).toHaveBeenCalledWith('music');
    expect(audio.moveClip).toHaveBeenCalledWith('music', 'music', 1.5);
    expect(audio.trimClip).toHaveBeenCalledWith('music', 'music', 'end', 2);
  } finally {
    await act(async () => root.unmount());
  }
});

// The real webcam track is used here; other lane adapters retain their isolated mocks above.
type WebcamTrackEditor = ComponentProps<typeof ReviewWebcamTrack>['editor'];

function webcamTrackEditor(
  camera: QuickEditWebcam,
  selection: WebcamTrackEditor['selection'],
  callbacks: Pick<
    WebcamTrackEditor,
    'toggle' | 'select' | 'navigate' | 'resizeHidden' | 'movePosition'
  >,
  allowed: boolean
): WebcamTrackEditor {
  return {
    ...callbacks,
    camera,
    selection,
    time: 3,
    sourceTime: 3,
    duration: 12,
    pending: false,
    failed: false,
    candidate: null,
    available: true,
    retry: vi.fn(async () => {}),
    resourceAttempt: 0,
    selectedPosition: undefined,
    hidden: undefined,
    placement: camera.placement,
    cropPlacement: camera.placement,
    screenBehavior: undefined,
    split: null,
    scene: { width: 160, height: 90 },
    crop: {
      zoom: camera.appearance.zoom,
      panX: camera.appearance.panX,
      panY: camera.appearance.panY,
    },
    hideRange: null,
    addHidden: vi.fn(),
    setScreenBehavior: vi.fn(),
    setCrop: vi.fn(),
    selectVisible: vi.fn(),
    patch: vi.fn(),
    place: vi.fn(),
    setSplit: vi.fn(),
    addPosition: vi.fn(),
    canHide: () => allowed,
    canResizeHidden: () => allowed,
    hide: vi.fn(),
    remove: vi.fn(),
  };
}

it('keeps actual webcam presentation stable while committed commands and visual invalidation stay live', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const scene = { width: 160, height: 90 };
  const camera = createQuickEditWebcam('camera', scene, scene);
  camera.hiddenRanges = [{ id: 'hidden', start: 2, end: 3 }];
  camera.positions = [
    {
      id: 'anchor',
      time: 5,
      placement: camera.placement,
      transition: { type: 'none', duration: 0 },
    },
  ];
  const projection = createTrackProjection(12, []);
  const projected = vi.spyOn(projection.display, 'resultToDisplay');
  const first = {
    toggle: vi.fn(async () => {}),
    select: vi.fn(),
    navigate: vi.fn(),
    resizeHidden: vi.fn(),
    movePosition: vi.fn(),
  };
  const latest = {
    toggle: vi.fn(async () => {}),
    select: vi.fn(),
    navigate: vi.fn(),
    resizeHidden: vi.fn(),
    movePosition: vi.fn(),
  };
  const abandoned = {
    toggle: vi.fn(async () => {}),
    select: vi.fn(),
    navigate: vi.fn(),
    resizeHidden: vi.fn(),
    movePosition: vi.fn(),
  };
  const suspended = vi.fn();
  const never = new Promise<void>(() => {});
  function Suspend(): never {
    suspended();
    throw never;
  }
  function Probe({
    callbacks,
    selection = { kind: 'none' },
    data = camera,
    map = projection,
    allowed = true,
    suspend = false,
    liveTime = 3,
  }: {
    callbacks: typeof first;
    selection?: WebcamTrackEditor['selection'];
    data?: QuickEditWebcam;
    map?: typeof projection;
    allowed?: boolean;
    suspend?: boolean;
    liveTime?: number;
  }) {
    const editor = {
      ...webcamTrackEditor(data, selection, callbacks, allowed),
      time: liveTime,
      sourceTime: liveTime,
    };
    return (
      <>
        <ReviewWebcamTrack editor={editor} projection={map} beforeAction={(action) => action()} />
        {suspend && <Suspend />}
      </>
    );
  }
  const render = (props: ComponentProps<typeof Probe>) =>
    act(() =>
      root.render(
        <Suspense fallback={null}>
          <Probe {...props} />
        </Suspense>
      )
    );
  const toggle = () =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.webcamApply"]')!;
  const hidden = () =>
    host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.webcamHiddenMarker"]')!;
  const selectHidden = () =>
    act(() => hidden().querySelector<HTMLButtonElement>('button')!.click());
  const position = () =>
    host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.webcamPosition"]')!;
  const end = () => hidden().querySelector<HTMLButtonElement>('[data-edge="end"]')!;
  try {
    render({ callbacks: first, selection: { kind: 'zoom', id: 'first-focus' } });
    expect(projected).toHaveBeenCalled();
    projected.mockClear();
    vi.mocked(translate).mockClear();
    render({ callbacks: latest, selection: { kind: 'zoom', id: 'next-focus' }, liveTime: 8 });
    expect(projected).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
    act(() => toggle().click());
    selectHidden();
    act(() => position().click());
    expect(latest.navigate).toHaveBeenCalledWith('anchor');
    expect(latest.toggle).toHaveBeenCalledOnce();
    expect(latest.select).toHaveBeenCalledWith({ kind: 'webcam-hidden', id: 'hidden' }, undefined);
    expect(first.toggle).not.toHaveBeenCalled();
    expect(first.select).not.toHaveBeenCalled();
    expect(first.navigate).not.toHaveBeenCalled();
    act(() =>
      startTransition(() =>
        root.render(
          <Suspense fallback={null}>
            <Probe callbacks={abandoned} suspend />
          </Suspense>
        )
      )
    );
    expect(suspended).toHaveBeenCalled();
    act(() => toggle().click());
    selectHidden();
    expect(latest.toggle).toHaveBeenCalledTimes(2);
    expect(abandoned.toggle).not.toHaveBeenCalled();
    expect(abandoned.select).not.toHaveBeenCalled();
    render({
      callbacks: latest,
      selection: { kind: 'webcam-position', id: 'anchor' },
      allowed: false,
    });
    expect(position().getAttribute('aria-pressed')).toBe('true');
    expect(end().disabled).toBe(true);
    const changed = {
      ...camera,
      enabled: false,
      hiddenRanges: [{ id: 'hidden', start: 3, end: 4 }],
    };
    render({
      callbacks: latest,
      data: changed,
      selection: { kind: 'webcam-hidden', id: 'hidden' },
    });
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(hidden().dataset['reviewSnapStart']).toBe('3');
    expect(hidden().className).toContain('review-timeline-item-selected');
    expect(end().disabled).toBe(false);
    const map = createTrackProjection(12, [
      { id: 'cut', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
    ]);
    render({ callbacks: latest, data: changed, map });
    expect(hidden().dataset['reviewSnapStart']).toBe(String(map.display.resultToDisplay(3)));
    expect(position().dataset['reviewSnapStart']).toBe(String(map.display.resultToDisplay(5)));
    act(() =>
      end().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
    );
    expect(latest.resizeHidden).toHaveBeenCalledWith('hidden', {
      start: 3,
      end: map.display.displayToResult(map.display.resultToDisplay(4, 'end') + 1 / 30),
    });
    act(() =>
      position().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
    );
    expect(latest.movePosition).toHaveBeenCalledWith(
      'anchor',
      map.display.displayToResult(map.display.resultToDisplay(5) + 0.1)
    );
  } finally {
    act(() => root.unmount());
    projected.mockRestore();
    vi.unstubAllGlobals();
  }
});
