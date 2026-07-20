import type React from 'react';

import { translate } from '../../../../platform/i18n/index';
import type { PreviewStageCanvasProps } from '../types';
import { PreviewStageAudioBank } from './audio-bank';
import { PreviewStageVideoBank } from './video-bank';

function PreviewStageEmptyState() {
  return (
    <div
      className={[
        'pointer-events-none absolute inset-0 flex items-center justify-center text-sm',
        'text-[var(--sniptale-color-text-muted)]',
      ].join(' ')}
    >
      {translate('videoEditor.stage.empty')}
    </div>
  );
}

export function PreviewStageCanvasBanks(
  params: Pick<
    PreviewStageCanvasProps,
    'audioBankClips' | 'audioRefs' | 'assetUrls' | 'project' | 'videoBankClips' | 'videoRefs'
  >
): React.JSX.Element {
  const shouldShowEmptyState =
    params.project.clips.length === 0 &&
    params.project.cursorTrack === null &&
    params.project.actionEvents.length === 0;

  return (
    <>
      {params.videoBankClips.length > 0 ? (
        <PreviewStageVideoBank
          assetUrls={params.assetUrls}
          bankClips={params.videoBankClips}
          videoRefs={params.videoRefs}
        />
      ) : null}
      {params.audioBankClips.length > 0 ? (
        <PreviewStageAudioBank
          assetUrls={params.assetUrls}
          audioBankClips={params.audioBankClips}
          audioRefs={params.audioRefs}
        />
      ) : null}
      {shouldShowEmptyState ? <PreviewStageEmptyState /> : null}
    </>
  );
}
