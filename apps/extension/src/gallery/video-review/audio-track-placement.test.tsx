// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewAudioTrack } from './audio-track';
import { createTrackProjection } from './track-projection';
import { anchorReviewVoiceoverAtSource } from '../../features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import type { ReviewEdit } from '../../features/video/review/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;
const onMoveClip = vi.fn();
const onImportFile = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  onMoveClip.mockClear();
  onImportFile.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderVoiceover(
  duration: number,
  edits: ReviewEdit[],
  clips: QuickEditAudioClip[],
  snapTimes: number[] = []
) {
  act(() =>
    root.render(
      <ReviewAudioTrack
        projection={createTrackProjection(duration, edits)}
        audio={{
          original: { muted: false, volume: 1 },
          voiceover: clips,
          music: [],
          voiceoverSegments: buildReviewTimeMap(duration, edits),
        }}
        duration={duration}
        snapTimes={snapTimes}
        selectedId={null}
        busy={false}
        onSelect={vi.fn()}
        onMoveClip={onMoveClip}
        onTrimClip={vi.fn()}
        onOriginal={vi.fn()}
        onImportFile={onImportFile}
        onRecordVoiceover={vi.fn()}
      />
    )
  );
  for (const block of host.querySelectorAll('[data-audio-id]'))
    Object.assign(block, { hasPointerCapture: () => false, releasePointerCapture: vi.fn() });
  return host.querySelector<HTMLElement>(
    '[data-audio-lane="voiceover"][data-ui="gallery.videoReview.audioLane"]'
  )!;
}

it('drops a new voiceover in source coordinates inside a cut', async () => {
  const lane = renderVoiceover(
    10,
    [{ id: 'cut', kind: 'cut', start: 2, end: 6, requestedStart: 2, requestedEnd: 6 }],
    []
  );
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  const file = new File(['voice'], 'voice.wav', { type: 'audio/wav' });
  const event = new MouseEvent('drop', { bubbles: true, clientX: 400 });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file], types: ['Files'] } });
  await act(async () => lane.dispatchEvent(event));
  expect(onImportFile).toHaveBeenLastCalledWith(file, 'voiceover', 4);
});

it('moves a long retained tail without snapping its clipped visible end back to the playhead', async () => {
  const recording = anchorReviewVoiceoverAtSource(
    createQuickEditAudioClip({
      id: 'long',
      assetId: 'asset',
      timelineStart: 9,
      duration: 20,
      endMax: 29,
    }),
    buildReviewTimeMap(12, [])
  );
  const lane = renderVoiceover(12, [], [recording], [12]);
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1200, 32));
  const block = lane.querySelector<HTMLDivElement>('[role="button"]')!;
  Object.assign(block, { setPointerCapture: vi.fn() });
  for (const [type, clientX] of [
    ['pointerdown', 900],
    ['pointermove', 1000],
    ['pointerup', 1000],
  ] as const)
    await act(async () =>
      block.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button: 0 }))
    );
  expect(onMoveClip).toHaveBeenLastCalledWith('voiceover', 'long', 10);
});
