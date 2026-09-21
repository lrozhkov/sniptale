// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewAudioTrack } from './audio-track';
import { createTrackProjection } from './track-projection';
import { anchorReviewVoiceover } from '../../features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import type {
  QuickEditAudioClip,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

const onMoveClip = vi.fn((_lane: 'voiceover' | 'music', _id: string, _start: number) => undefined);
const onTrimClip = vi.fn(
  (_lane: 'voiceover' | 'music', _id: string, _edge: string, _time: number) => undefined
);
const onOriginal = vi.fn((_patch: Partial<QuickEditOriginalAudio>) => undefined);
const onImportFile = vi.fn(
  (_file: File, _lane: 'voiceover' | 'music', _timelineTime?: number) => undefined
);
const onRecordVoiceover = vi.fn();
const onSelect = vi.fn((_id: string | null) => undefined);

const clip = (id: string, timelineStart: number, duration: number): QuickEditAudioClip => ({
  ...createQuickEditAudioClip({ id, assetId: 'asset:1', timelineStart, duration, endMax: 10 }),
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  for (const mock of [
    onMoveClip,
    onTrimClip,
    onOriginal,
    onImportFile,
    onSelect,
    onRecordVoiceover,
  ])
    mock.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderTrack = (
  audio?: {
    voiceoverSegments?: ReturnType<typeof buildReviewTimeMap>;
    original: QuickEditOriginalAudio;
    voiceover: QuickEditAudioClip[];
    music: QuickEditAudioClip[];
  },
  busy = false,
  snapTimes: readonly number[] = [],
  hasOriginalAudio = true,
  assets?: Parameters<typeof ReviewAudioTrack>[0]['assets'],
  projection?: Parameters<typeof ReviewAudioTrack>[0]['projection'],
  waveforms?: Parameters<typeof ReviewAudioTrack>[0]['waveforms']
) => {
  act(() => {
    root.render(
      <ReviewAudioTrack
        projection={projection}
        waveforms={waveforms}
        assets={assets}
        hasOriginalAudio={hasOriginalAudio}
        audio={audio ?? { original: { muted: false, volume: 1 }, voiceover: [], music: [] }}
        snapTimes={snapTimes}
        duration={10}
        selectedId={null}
        busy={busy}
        onSelect={onSelect}
        onMoveClip={onMoveClip}
        onTrimClip={onTrimClip}
        onOriginal={onOriginal}
        onImportFile={onImportFile}
        onRecordVoiceover={onRecordVoiceover}
      />
    );
  });
  return [...host.querySelectorAll('[data-ui="gallery.videoReview.audioLane"]')];
};

it('shows the three semantic lanes and toggles the original mute', async () => {
  const lanes = renderTrack();
  expect(lanes).toHaveLength(3);
  expect(lanes[0]!.parentElement!.parentElement!.textContent).toContain(
    'gallery.videoReview.audioOriginal'
  );
  expect(lanes[1]!.parentElement!.parentElement!.textContent).toContain(
    'gallery.videoReview.audioVoiceover'
  );
  expect(lanes[2]!.parentElement!.parentElement!.textContent).toContain(
    'gallery.videoReview.audioMusic'
  );
  const mute = lanes[0]!.parentElement!.parentElement!.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.audioEnabled"]'
  )!;
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  await act(async () => mute.click());
  expect(onOriginal).toHaveBeenCalledWith({ muted: true });
});

it('imports audio through the hidden file picker', async () => {
  renderTrack();
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input.accept).toBe('audio/*');
  Object.defineProperty(input, 'files', {
    value: [new File([new Uint8Array(2)], 'song.mp3', { type: 'audio/mpeg' })],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImportFile).toHaveBeenCalled();
});

function dispatchDrag(
  lane: Element,
  type: 'dragenter' | 'dragleave' | 'dragover' | 'drop',
  files: File[],
  clientX = 0
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types: files.length ? ['Files'] : [] },
  });
  lane.dispatchEvent(event);
}

it('imports a dropped audio file at the drop point on the music lane', async () => {
  const lanes = renderTrack();
  const music = lanes[2]!;
  vi.spyOn(music, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  const file = new File([new Uint8Array(2)], 'song.mp3', { type: 'audio/mpeg' });
  await act(async () => dispatchDrag(music, 'dragenter', [file], 0));
  expect(music.getAttribute('data-drop-active')).toBe('true');
  await act(async () => dispatchDrag(music, 'drop', [file], 250));
  expect(onImportFile).toHaveBeenCalledOnce();
  expect(onImportFile.mock.calls[0]![0]).toBe(file);
  expect(onImportFile.mock.calls[0]![1]).toBe('music');
  expect(onImportFile.mock.calls[0]![2]).toBeCloseTo(2.5, 5);
  expect(music.getAttribute('data-drop-active')).toBeNull();
});

it('clears the drop affordance on leave and ignores drops without files', async () => {
  const lanes = renderTrack();
  const music = lanes[2]!;
  const voiceover = lanes[1]!;
  const file = new File([new Uint8Array(2)], 'song.mp3', { type: 'audio/mpeg' });
  await act(async () => dispatchDrag(music, 'dragenter', [file]));
  expect(music.getAttribute('data-drop-active')).toBe('true');
  await act(async () => dispatchDrag(music, 'dragleave', [file]));
  expect(music.getAttribute('data-drop-active')).toBeNull();
  await act(async () => dispatchDrag(music, 'drop', [], 400));
  expect(onImportFile).not.toHaveBeenCalled();
  await act(async () => dispatchDrag(voiceover, 'drop', [file], 400));
  expect(onImportFile).toHaveBeenCalledOnce();
  expect(onImportFile.mock.calls[0]![1]).toBe('voiceover');
});

it('rejects file drops while the editor is busy', async () => {
  const lanes = renderTrack(undefined, true);
  const music = lanes[2]!;
  const file = new File([new Uint8Array(2)], 'song.mp3', { type: 'audio/mpeg' });
  await act(async () => dispatchDrag(music, 'dragenter', [file]));
  expect(music.getAttribute('data-drop-active')).toBeNull();
  await act(async () => dispatchDrag(music, 'drop', [file], 250));
  expect(onImportFile).not.toHaveBeenCalled();
});

it('drags clip blocks with move and trim edges and commits clamped values', async () => {
  const clipA = clip('a1', 2, 2);
  const lanes = renderTrack({
    original: { muted: false, volume: 1 },
    voiceover: [clipA],
    music: [],
  });
  const lane = lanes[1]!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  const block = lane.querySelector<HTMLDivElement>('[role="button"]')!;
  Object.assign(block, { setPointerCapture: vi.fn() });
  expect(block.style.left).toBe('20%');
  expect(Number.parseFloat(block.style.width)).toBeCloseTo(20);
  const send = (kind: string, x: number) =>
    act(async () =>
      block.dispatchEvent(
        new MouseEvent(kind, { bubbles: true, clientX: x, clientY: 0, button: 0 })
      )
    );
  await send('pointerdown', 0);
  await send('pointermove', 100);
  await send('pointerup', 100);
  expect(onSelect).toHaveBeenCalledWith('a1');
  expect(onMoveClip).toHaveBeenCalledWith('voiceover', 'a1', 3);
  await send('pointerdown', 0);
  await send('pointermove', -300);
  await send('pointerup', -300);
  expect(onMoveClip).toHaveBeenCalledWith('voiceover', 'a1', 0);
});

it('trims the right edge through its drag handle', async () => {
  const lanes = renderTrack({
    original: { muted: false, volume: 1 },
    voiceover: [clip('a1', 2, 4)],
    music: [],
  });
  const lane = lanes[1]!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 8));
  const edge = lane.querySelector<HTMLSpanElement>('[data-audio-edge="end"]')!;
  const block = lane.querySelector<HTMLDivElement>('[role="button"]')!;
  Object.assign(block, { setPointerCapture: vi.fn() });
  const send = (kind: string, target: Element, x: number) =>
    act(async () =>
      target.dispatchEvent(
        new MouseEvent(kind, { bubbles: true, clientX: x, clientY: 0, button: 0 })
      )
    );
  await send('pointerdown', edge, 0);
  await send('pointermove', edge, 100);
  await send('pointerup', block, 100);
  expect(onTrimClip).toHaveBeenCalledWith('voiceover', 'a1', 'end', 6, undefined);
});

it('keeps the preview duration while moving near the timeline end (A3)', async () => {
  const lanes = renderTrack({
    original: { muted: false, volume: 1 },
    voiceover: [clip('a1', 0, 2)],
    music: [],
  });
  const lane = lanes[1]!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  const block = lane.querySelector<HTMLDivElement>('[role="button"]')!;
  Object.assign(block, { setPointerCapture: vi.fn() });
  const send = (kind: string, x: number) =>
    act(async () =>
      block.dispatchEvent(
        new MouseEvent(kind, { bubbles: true, clientX: x, clientY: 0, button: 0 })
      )
    );
  await send('pointerdown', 0);
  await send('pointermove', 1950);
  expect(Number.parseFloat(block.style.width)).toBeCloseTo(20);
  expect(block.style.left).toBe('80%');
  await send('pointerup', 1950);
  expect(onMoveClip).toHaveBeenCalledWith('voiceover', 'a1', 8);
});

it('discards a drag preview on pointer cancellation without committing it', async () => {
  const lanes = renderTrack({
    original: { muted: false, volume: 1 },
    voiceover: [clip('a1', 2, 2)],
    music: [],
  });
  const lane = lanes[1]!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  const block = lane.querySelector<HTMLDivElement>('[role="button"]')!;
  Object.assign(block, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => false),
  });
  const send = (kind: string, x: number) =>
    act(async () =>
      block.dispatchEvent(new MouseEvent(kind, { bubbles: true, clientX: x, button: 0 }))
    );
  await send('pointerdown', 0);
  await send('pointermove', 100);
  expect(block.style.left).toBe('30%');
  await send('pointercancel', 100);
  expect(block.style.left).toBe('20%');
  expect(onMoveClip).not.toHaveBeenCalled();
  expect(onTrimClip).not.toHaveBeenCalled();
});

it('snaps audio placement to projected edit edges and allows Shift to bypass', async () => {
  const lanes = renderTrack(
    { original: { muted: false, volume: 1 }, voiceover: [clip('a1', 2, 2)], music: [] },
    false,
    [3]
  );
  const lane = lanes[1]!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  const block = lane.querySelector<HTMLDivElement>('[role="button"]')!;
  Object.assign(block, { setPointerCapture: vi.fn() });
  const send = (kind: string, x: number, shiftKey = false) =>
    act(async () => {
      block.dispatchEvent(new MouseEvent(kind, { bubbles: true, clientX: x, button: 0, shiftKey }));
    });
  await send('pointerdown', 0);
  await send('pointermove', 95);
  await send('pointerup', 95);
  expect(onMoveClip).toHaveBeenLastCalledWith('voiceover', 'a1', 3);
  await send('pointerdown', 0);
  await send('pointermove', 95, true);
  await send('pointerup', 95, true);
  expect(onMoveClip).toHaveBeenLastCalledWith('voiceover', 'a1', 2.95);
});

it('omits original audio controls when the indexed source has no audio stream', () => {
  expect(renderTrack(undefined, false, [], false)).toHaveLength(2);
  expect(host.textContent).not.toContain('gallery.videoReview.audioOriginal');
});

it('shows filenames and visible handles, and clamps the preview to the original audio duration', async () => {
  const lanes = renderTrack(
    { original: { muted: false, volume: 1 }, voiceover: [clip('a1', 2, 2)], music: [] },
    false,
    [],
    true,
    new Map([['asset:1', { filename: 'voice.wav', duration: 3 }]])
  );
  const lane = lanes[1]!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 48));
  const block = lane.querySelector<HTMLDivElement>('[role="button"]')!;
  expect(block.title).toBe('voice.wav');
  expect(block.textContent?.trim()).toBe('');
  expect(block.querySelectorAll('[data-audio-edge] span')).toHaveLength(2);
  Object.assign(block, { setPointerCapture: vi.fn() });
  const edge = block.querySelector('[data-audio-edge="end"]')!;
  await act(async () =>
    edge.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 400 }))
  );
  await act(async () =>
    block.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 900 }))
  );
  expect(block.style.width).toBe('30%');
  await act(async () =>
    block.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 900 }))
  );
  expect(onTrimClip).toHaveBeenCalledWith('voiceover', 'a1', 'end', 5, 3);
});

it('marks removed source spans consistently across original, voiceover and music lanes', () => {
  const lanes = renderTrack(
    undefined,
    false,
    [],
    true,
    undefined,
    createTrackProjection(10, [
      { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    ])
  );
  for (const lane of lanes) {
    const mask = lane.querySelector<HTMLElement>('[aria-hidden="true"].opacity-80');
    expect(mask).not.toBeNull();
    expect(mask!.style.left).toBe('20%');
    expect(mask!.style.width).toBe('20%');
  }
});

it('shows an anchored recording until playback ends and snaps its audible end while moving', async () => {
  const recording = anchorReviewVoiceover(clip('a1', 2, 2), buildReviewTimeMap(10, []));
  const edits = [
    {
      id: 'speed',
      kind: 'speed' as const,
      start: 2,
      end: 6,
      requestedStart: 2,
      requestedEnd: 6,
      rate: 2 as const,
      audio: 'speed' as const,
    },
  ];
  const lanes = renderTrack(
    {
      original: { muted: false, volume: 1 },
      voiceover: [recording],
      music: [],
      voiceoverSegments: buildReviewTimeMap(10, edits),
    },
    false,
    [4.75],
    true,
    undefined,
    createTrackProjection(10, edits)
  );
  const block = lanes[1]!.querySelector<HTMLElement>('[role="button"]')!;
  expect(block.style.left).toBe('20%');
  expect(parseFloat(block.style.width)).toBeCloseTo(40);
  vi.spyOn(lanes[1]!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  Object.assign(block, { setPointerCapture: vi.fn() });
  await act(async () =>
    block.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 200 }))
  );
  await act(async () =>
    block.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 340 }))
  );
  expect(parseFloat(block.style.left)).toBeCloseTo(35);
  await act(async () =>
    block.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 340 }))
  );
  expect(onMoveClip).toHaveBeenCalledWith('voiceover', 'a1', 3.5);
});

it('moves anchored waveform samples with the clip before release and restores on Escape', async () => {
  const map = buildReviewTimeMap(10, []);
  const recording = anchorReviewVoiceover(clip('a1', 2, 2), map);
  const lanes = renderTrack(
    {
      original: { muted: false, volume: 1 },
      voiceover: [recording],
      music: [],
      voiceoverSegments: map,
    },
    false,
    [],
    true,
    undefined,
    createTrackProjection(10, []),
    new Map([
      [
        'asset:1',
        {
          duration: 4,
          peaks: [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6],
        },
      ],
    ])
  );
  const lane = lanes[1]!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  const block = lane.querySelector<HTMLElement>('[role="button"]')!;
  Object.assign(block, { setPointerCapture: vi.fn(), hasPointerCapture: () => false });
  const peaks = () => block.querySelector('path')!.getAttribute('d');
  const before = peaks();
  expect(before).not.toBe('');
  await act(async () =>
    block.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 200 }))
  );
  await act(async () =>
    block.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 300 }))
  );
  expect(block.style.left).toBe('30%');
  expect(peaks()).toBe(before);
  expect(onMoveClip).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(block.style.left).toBe('20%');
  expect(peaks()).toBe(before);
});
