import { useEffect, useRef, useState } from 'react';
import { AudioLines, Pause, Play, Sparkles } from 'lucide-react';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { translate } from '../../platform/i18n';
import {
  ReviewButton,
  reviewTextButtonClassName,
  reviewCompactTrackButtonClassName,
} from './controls';

/** Display precision never changes the authored native seconds. */
export function formatSpeechTime(time: number): string {
  const centiseconds = Math.max(0, Math.round(time * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor(centiseconds / 6000) % 60;
  const seconds = ((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0');
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${seconds}`;
}

type SpeechAuditionProps = {
  originalUrl: string | null;
  result?: { url: string; duration: number } | undefined;
  interval: { start: number; end: number };
  tempo: number;
  mainVideo?: HTMLVideoElement | undefined;
};

/** One mounted native audio lifetime coordinates playback and late play promises. */
function useSpeechAudition(props: SpeechAuditionProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const owner = useRef({ generation: 0, wantsPlayback: false }).current;
  const [requested, request] = useState<'original' | 'result'>('original');
  const [phase, setPhase] = useState<'paused' | 'loading' | 'playing' | 'error'>('paused');
  const [position, setPosition] = useState(0);
  const source =
    requested === 'result' && props.result ? 'result' : props.originalUrl ? 'original' : 'result';
  const url = source === 'original' ? props.originalUrl : props.result?.url;
  const start = source === 'original' ? props.interval.start : 0;
  const end = source === 'original' ? props.interval.end : (props.result?.duration ?? 0);
  const duration = Math.max(0, end - start);
  useEffect(() => {
    const media = audio.current;
    owner.generation++;
    owner.wantsPlayback = false;
    media?.pause();
    setPhase('paused');
    setPosition(0);
    if (media) media.playbackRate = props.tempo;
    return () => {
      owner.generation++;
      owner.wantsPlayback = false;
      media?.pause();
    };
  }, [url, start, end, props.tempo, owner]);
  useEffect(() => {
    const stop = () => {
      owner.generation++;
      owner.wantsPlayback = false;
      audio.current?.pause();
      setPhase('paused');
    };
    props.mainVideo?.addEventListener('play', stop);
    return () => props.mainVideo?.removeEventListener('play', stop);
  }, [props.mainVideo, owner]);
  const toggle = async () => {
    const media = audio.current;
    if (!media || !url || duration <= 0) return;
    const token = ++owner.generation;
    if (phase === 'playing' || phase === 'loading') {
      owner.wantsPlayback = false;
      media.pause();
      setPhase('paused');
      return;
    }
    props.mainVideo?.pause();
    if (media.currentTime < start || media.currentTime >= end) media.currentTime = start;
    media.playbackRate = props.tempo;
    owner.wantsPlayback = true;
    setPhase('loading');
    try {
      await media.play();
      if (token === owner.generation) setPhase('playing');
      else if (!owner.wantsPlayback) media.pause();
    } catch {
      if (token === owner.generation) setPhase('error');
    }
  };
  return {
    audio,
    phase,
    position,
    source,
    url,
    start,
    duration,
    toggle,
    request,
    pause: () => {
      owner.wantsPlayback = false;
      owner.generation++;
      setPhase('paused');
    },
    fail: () => setPhase('error'),
    ended: () => setPhase('paused'),
    seek: (value: number) => {
      const next = Math.max(0, Math.min(duration, value));
      if (audio.current) audio.current.currentTime = start + next;
      setPosition(next);
    },
    advance: (media: HTMLAudioElement) => {
      if (media.currentTime >= end) {
        media.pause();
        if (media.currentTime > end) media.currentTime = end;
      }
      setPosition(Math.max(0, Math.min(duration, media.currentTime - start)));
    },
  };
}

/** Compact view of the single audition owner, independently of authored clip gain. */
export function SpeechAudition(props: SpeechAuditionProps) {
  const playback = useSpeechAudition(props);
  const { audio, phase, position, source, url, start, duration } = playback;
  return (
    <div data-ui="gallery.videoReview.speechAudition" className="min-w-0 space-y-1">
      <audio
        ref={audio}
        hidden
        preload="metadata"
        src={url ?? undefined}
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = start;
        }}
        onPause={playback.pause}
        onEnded={playback.ended}
        onError={playback.fail}
        onTimeUpdate={(event) => playback.advance(event.currentTarget)}
      />
      <div className="flex min-w-0 items-center gap-1">
        <ReviewButton
          label={translate(
            phase === 'playing' || phase === 'loading'
              ? 'gallery.videoReview.pause'
              : 'gallery.videoReview.play'
          )}
          className={`${reviewCompactTrackButtonClassName} shrink-0 !px-0`}
          disabled={!url || duration <= 0}
          aria-busy={phase === 'loading'}
          onClick={() => void playback.toggle()}
        >
          {phase === 'playing' || phase === 'loading' ? <Pause size={14} /> : <Play size={14} />}
        </ReviewButton>
        <ProductRange
          aria-label={translate('gallery.videoReview.speechAuditionSeek')}
          aria-valuetext={`${formatSpeechTime(position)} / ${formatSpeechTime(duration)}`}
          className="min-w-8 flex-1"
          min={0}
          max={duration}
          step={0.01}
          value={position}
          disabled={!url || duration <= 0}
          onChange={(event) => playback.seek(event.currentTarget.valueAsNumber)}
        />
        <span
          className={`shrink-0 whitespace-nowrap text-[10px] tabular-nums
          text-[var(--sniptale-color-text-secondary)]`}
        >
          {formatSpeechTime(position)} / {formatSpeechTime(duration)}
        </span>
        <div
          role="group"
          aria-label={translate('gallery.videoReview.speechAuditionSource')}
          className="flex shrink-0"
        >
          {(['original', 'result'] as const).map((choice) => (
            <ReviewButton
              key={choice}
              label={translate(
                choice === 'original'
                  ? 'gallery.videoReview.speechOriginal'
                  : 'gallery.videoReview.speechPreview'
              )}
              className={`${reviewTextButtonClassName} !w-8 !px-0`}
              aria-pressed={source === choice}
              disabled={choice === 'original' ? !props.originalUrl : !props.result}
              onClick={() => playback.request(choice)}
            >
              {choice === 'original' ? <AudioLines size={14} /> : <Sparkles size={14} />}
            </ReviewButton>
          ))}
        </div>
      </div>
      {phase === 'error' && (
        <p role="alert" className="text-xs">
          {translate('gallery.videoReview.speechAuditionFailed')}
        </p>
      )}
    </div>
  );
}
