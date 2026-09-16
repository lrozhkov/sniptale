import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import type { TourNarration } from '@sniptale/runtime-contracts/scenario/types/tour';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import { formatDurationLabel } from '../../../composition/audio-recording/format';
import type { Translate } from '../../../platform/i18n';
import { createNarrationPlayback } from './narration-playback';

/** Only the selected narration acquires a URL and an independently disposable preview. */
export function TourNarrationPreview({ narration, t }: { narration: TourNarration; t: Translate }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [media, setMedia] = useState({ time: 0, playing: false, ready: false, failed: false });
  const audio = useRef<HTMLAudioElement>(null);
  const latest = useRef(narration);
  latest.current = narration;
  const playback = useRef<ReturnType<typeof createNarrationPlayback> | null>(null);
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setSrc(null);
    setFailed(false);
    void getScenarioAssetBlob(narration.assetId)
      .then((blob) => {
        if (!active) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [narration.assetId, retry]);
  useEffect(() => {
    setMedia({ time: 0, playing: false, ready: false, failed: false });
    if (!src || !audio.current) return;
    const lifetime = new AbortController();
    const owner = createNarrationPlayback(audio.current, latest.current, setMedia, lifetime.signal);
    playback.current = owner;
    owner.update(latest.current);
    return () => {
      lifetime.abort();
      playback.current = null;
    };
  }, [src]);
  useEffect(() => {
    playback.current?.update(narration);
  }, [narration]);
  const label = t(media.playing ? 'scenario.editor.tourPause' : 'scenario.editor.tourPlay');
  return (
    <div className="flex min-w-0 flex-col gap-2" data-tour-narration-preview>
      {src && <audio ref={audio} src={src} preload="auto" />}
      <div className="flex min-w-0 items-center gap-2">
        <ContentToolbarButton
          title={label}
          aria-label={label}
          disabled={!media.ready}
          onClick={() => void playback.current?.toggle()}
        >
          {media.playing ? <Pause size={15} /> : <Play size={15} />}
        </ContentToolbarButton>
        <ProductRange
          aria-label={t('scenario.editor.tourSeek')}
          min={narration.trimStart}
          max={narration.trimEnd}
          step={0.01}
          value={Math.max(narration.trimStart, Math.min(narration.trimEnd, media.time))}
          disabled={!media.ready}
          className="min-w-0 flex-1"
          onChange={(event) => playback.current?.seek(Number(event.currentTarget.value))}
        />
        <span className="text-xs tabular-nums">
          {formatDurationLabel(Math.max(0, media.time - narration.trimStart))}
        </span>
      </div>
      {!src && !failed && (
        <p className="guide-inspector-hint">{t('scenario.editor.tourAudioLoading')}</p>
      )}
      {(failed || media.failed) && (
        <>
          <p role="alert" className="guide-inspector-hint">
            {t('scenario.editor.tourAudioFailed')}
          </p>
          <ProductActionButton
            compact
            tone="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t('scenario.editor.tourRetry')}
          </ProductActionButton>
        </>
      )}
    </div>
  );
}
