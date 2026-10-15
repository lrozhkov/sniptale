// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ReviewOriginalSpeech } from '../../features/video/review/original-speech';

it('keeps admitted alpha speech metadata without an additional playback lane', async () => {
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
  const render = () =>
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
          onSelect={vi.fn()}
          onMoveClip={vi.fn()}
          onTrimClip={vi.fn()}
          onOriginal={vi.fn()}
          onImportFile={vi.fn()}
          onRecordVoiceover={vi.fn()}
          onOpenSpeech={onOpenSpeech}
        />
      )
    );
  try {
    const before = structuredClone(speech);
    render();
    expect(host.querySelector('[data-ui="gallery.videoReview.revoiceTrack"]')).toBeNull();
    expect(onOpenSpeech).not.toHaveBeenCalled();
    expect(speech).toEqual(before);
    expect(speech.transcript.replacements).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
