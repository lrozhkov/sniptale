import { useLayoutEffect, useRef } from 'react';

import type { PreviewStageAudioBankClip, PreviewStageAudioRefs } from '../types';

interface PreviewStageAudioBankProps {
  assetUrls: Record<string, string>;
  audioBankClips: PreviewStageAudioBankClip[];
  audioRefs: PreviewStageAudioRefs;
}

export function PreviewStageAudioBank({
  assetUrls,
  audioBankClips,
  audioRefs,
}: PreviewStageAudioBankProps): React.JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0"
    >
      {audioBankClips.map((clip) => {
        const src = assetUrls[clip.assetId];
        if (!src) {
          return null;
        }

        return <PreviewBankAudio key={clip.id} clipId={clip.id} src={src} audioRefs={audioRefs} />;
      })}
    </div>
  );
}

function PreviewBankAudio({
  clipId,
  src,
  audioRefs,
}: {
  clipId: string;
  src: string;
  audioRefs: PreviewStageAudioRefs;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useLayoutEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.defaultMuted = false;
    audio.muted = false;
    audio.volume = 1;
    audio.src = src;
    const audios = audioRefs.current;
    audios[clipId] = audio;
    return () => {
      if (audios[clipId] === audio) delete audios[clipId];
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [clipId, src, audioRefs]);
  return <audio ref={ref} preload="auto" />;
}
