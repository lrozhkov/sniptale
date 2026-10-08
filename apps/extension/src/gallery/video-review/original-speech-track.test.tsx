// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewOriginalSpeechTrack } from './original-speech-track';
import { createTrackProjection } from './track-projection';
import type { ReviewOriginalSpeech } from '../../features/video/review/original-speech';

it('keeps accepted native slots visible across speed, cuts and lane disabling', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onToggle = vi.fn();
  const speech: ReviewOriginalSpeech = {
    enabled: true,
    transcript: {
      version: 1,
      phrases: [],
      replacements: [
        {
          id: 'accepted',
          phraseId: 'old-draft',
          revision: 0,
          start: 2,
          end: 6,
          text: 'Accepted speech',
          textSignature: 'sig',
          assetId: 'project-asset:audio',
          duration: 2,
          enabled: true,
          originalVolume: 0,
          profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' },
        },
      ],
    },
  };
  const projection = createTrackProjection(10, [
    {
      id: 'cut',
      kind: 'cut',
      start: 3,
      end: 4,
      requestedStart: 3,
      requestedEnd: 4,
    },
    {
      id: 'speed',
      kind: 'speed',
      start: 4,
      end: 8,
      requestedStart: 4,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const render = (busy = false) =>
    act(() =>
      root.render(
        <ReviewOriginalSpeechTrack
          speech={speech}
          duration={7}
          projection={projection}
          selectedId="accepted"
          busy={busy}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      )
    );
  try {
    render();
    const item = host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.revoiceTrack"] button'
    )!;
    expect(item.style.left).toBe('20%');
    expect(item.style.width).toBe('40%');
    expect(item.getAttribute('aria-pressed')).toBe('true');
    act(() => item.click());
    expect(onSelect).toHaveBeenCalledWith('accepted', 2);
    const toggle = host.querySelector<HTMLButtonElement>('[data-track-controls] button')!;
    act(() => toggle.click());
    expect(onToggle).toHaveBeenCalledWith(false);
    speech.enabled = false;
    render(true);
    expect(host.querySelector('[data-review-track-muted="true"]')).not.toBeNull();
    expect(
      host.querySelectorAll('[data-ui="gallery.videoReview.revoiceTrack"] button')
    ).toHaveLength(1);
    act(() => item.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    speech.transcript.replacements = [];
    render();
    expect(host.textContent).toBe('');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('shows the separate speech lane when microphone and music lanes are hidden', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { ReviewAudioTrack } = await import('./audio-track');
  const host = document.createElement('div');
  const root = createRoot(host);
  const speech: ReviewOriginalSpeech = {
    enabled: false,
    transcript: {
      version: 1,
      phrases: [],
      replacements: [
        {
          id: 'accepted',
          phraseId: 'phrase',
          revision: 0,
          start: 1,
          end: 2,
          assetId: 'project-asset:audio',
          duration: 1,
          enabled: true,
          originalVolume: 0,
          text: 'Retained speech',
          textSignature: 'signature',
          profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' },
        },
      ],
    },
  };
  const onOpenSpeech = vi.fn();
  const onToggleSpeech = vi.fn();
  const render = (advanced: boolean) =>
    act(() =>
      root.render(
        <ReviewAudioTrack
          duration={10}
          selectedId={null}
          busy={false}
          audio={{
            original: { volume: 1, muted: false },
            music: [],
            voiceover: [],
            originalSpeech: speech,
          }}
          hasOriginalAudio={false}
          showAddedAudio={false}
          showOriginalSpeech={advanced}
          onSelect={vi.fn()}
          onMoveClip={vi.fn()}
          onTrimClip={vi.fn()}
          onOriginal={vi.fn()}
          onImportFile={vi.fn()}
          onRecordVoiceover={vi.fn()}
          onOpenSpeech={onOpenSpeech}
          onToggleSpeech={onToggleSpeech}
        />
      )
    );
  try {
    render(true);
    expect(host.querySelector('[data-ui="gallery.videoReview.revoiceTrack"]')).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[data-track-controls] button')!.click());
    expect(onToggleSpeech).toHaveBeenCalledWith(true);
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.revoiceTrack"] button')!
        .click()
    );
    expect(onOpenSpeech).toHaveBeenCalledWith('accepted', 1);
    render(false);
    expect(host.querySelector('[data-ui="gallery.videoReview.revoiceTrack"]')).toBeNull();
    expect(speech.transcript.replacements).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
