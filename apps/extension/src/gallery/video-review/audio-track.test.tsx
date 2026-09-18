// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewAudioTrack } from './audio-track';
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
const onImportFile = vi.fn((_file: File, _timelineTime?: number) => undefined);
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
    original: QuickEditOriginalAudio;
    voiceover: QuickEditAudioClip[];
    music: QuickEditAudioClip[];
  },
  busy = false
) => {
  act(() => {
    root.render(
      <ReviewAudioTrack
        audio={audio ?? { original: { muted: false, volume: 1 }, voiceover: [], music: [] }}
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
  expect(lanes[0]!.textContent).toContain('gallery.videoReview.audioOriginal');
  expect(lanes[1]!.textContent).toContain('gallery.videoReview.audioVoiceover');
  expect(lanes[2]!.textContent).toContain('gallery.videoReview.audioMusic');
  const mute = lanes[0]!.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.audioClipMute"]'
  )!;
  expect(mute.getAttribute('aria-pressed')).toBe('false');
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
  expect(onImportFile.mock.calls[0]![1]).toBeCloseTo(2.5, 5);
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
  await act(async () => dispatchDrag(voiceover, 'dragenter', [file]));
  expect(voiceover.getAttribute('data-drop-active')).toBeNull();
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
  expect(block.style.width).toBe('20%');
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
  expect(onTrimClip).toHaveBeenCalledWith('voiceover', 'a1', 'end', 7);
});
