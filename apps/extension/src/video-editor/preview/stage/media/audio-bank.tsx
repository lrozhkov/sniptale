import type React from 'react';

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

        return (
          <audio
            key={clip.id}
            ref={(node) => {
              if (node) {
                node.defaultMuted = false;
                node.muted = false;
                node.volume = 1;
                audioRefs.current[clip.id] = node;
                return;
              }

              delete audioRefs.current[clip.id];
            }}
            src={src}
            preload="auto"
          />
        );
      })}
    </div>
  );
}
