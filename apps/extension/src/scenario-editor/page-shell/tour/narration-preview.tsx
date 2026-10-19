import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import type { TourNarration } from '@sniptale/runtime-contracts/scenario/types/tour';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductInput, ProductRange } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import { formatDurationLabel } from '../../../composition/audio-recording/format';
import type { Translate } from '../../../platform/i18n';
import { createNarrationPlayback } from './narration-playback';

/** Only the selected narration acquires a URL and an independently disposable preview. */
export function TourNarrationPreview({
  narration,
  disabled = false,
  onTrimChange,
  t,
}: {
  narration: TourNarration;
  disabled?: boolean;
  onTrimChange?: (patch: Pick<TourNarration, 'trimStart' | 'trimEnd'>) => boolean;
  t: Translate;
}) {
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
          disabled={disabled || !media.ready || media.failed}
          onClick={() => void playback.current?.toggle()}
        >
          {media.playing ? <Pause size={15} /> : <Play size={15} />}
        </ContentToolbarButton>
        <NarrationTrimScale
          narration={narration}
          time={media.time}
          disabled={disabled || !media.ready || media.failed || failed}
          onPreview={(range) => playback.current?.update({ ...narration, ...range })}
          onCommit={onTrimChange}
          onSeek={(time) => playback.current?.seek(time)}
          t={t}
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

type TrimRange = Pick<TourNarration, 'trimStart' | 'trimEnd'>;
type TrimEdge = keyof TrimRange;

/** A trim gesture previews locally and publishes one accepted history edit on release. */
function NarrationTrimScale({
  narration,
  time,
  disabled,
  onPreview,
  onCommit,
  onSeek,
  t,
}: {
  narration: TourNarration;
  time: number;
  disabled: boolean;
  onPreview: (range: TrimRange) => void;
  onCommit?: ((range: TrimRange) => boolean) | undefined;
  onSeek: (time: number) => void;
  t: Translate;
}) {
  const [draft, setDraft] = useState<TrimRange | null>(null);
  const active = useRef<{ edge: TrimEdge; pointerId: number; range: TrimRange } | null>(null);
  const scale = useRef<HTMLDivElement>(null);
  const accepted = useRef(narration);
  accepted.current = narration;
  const callbacks = useRef({ onPreview, onCommit });
  callbacks.current = { onPreview, onCommit };
  const range = draft ?? narration;
  const gap = Math.min(0.01, narration.duration / 2);
  const normalize = (edge: TrimEdge, value: number, base: TrimRange): TrimRange => ({
    trimStart: base.trimStart,
    trimEnd: base.trimEnd,
    [edge]:
      edge === 'trimStart'
        ? Math.max(0, Math.min(base.trimEnd - gap, value))
        : Math.max(base.trimStart + gap, Math.min(narration.duration, value)),
  });
  const preview = (next: TrimRange) => {
    setDraft(next);
    callbacks.current.onPreview(next);
  };
  const cancel = () => {
    active.current = null;
    setDraft(null);
    callbacks.current.onPreview(accepted.current);
  };
  const commit = (next: TrimRange) => {
    active.current = null;
    setDraft(null);
    if (next.trimStart === narration.trimStart && next.trimEnd === narration.trimEnd) {
      callbacks.current.onPreview(narration);
      return;
    }
    if (!callbacks.current.onCommit?.(next)) callbacks.current.onPreview(narration);
  };
  useEffect(() => {
    const blur = () => {
      active.current = null;
      setDraft(null);
      callbacks.current.onPreview(accepted.current);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') blur();
    };
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  useEffect(() => {
    active.current = null;
    setDraft(null);
    callbacks.current.onPreview(narration);
  }, [narration, disabled]);
  const move = (clientX: number) => {
    const gesture = active.current;
    const rect = scale.current?.getBoundingClientRect();
    if (!gesture || !rect?.width) return;
    const value = Math.round(((clientX - rect.left) / rect.width) * narration.duration * 100) / 100;
    gesture.range = normalize(gesture.edge, value, gesture.range);
    preview(gesture.range);
  };
  return (
    <div className="tour-narration-trim">
      <div ref={scale} className="tour-narration-scale">
        <div
          className="tour-narration-selection"
          style={{
            left: `${(range.trimStart / narration.duration) * 100}%`,
            width: `${((range.trimEnd - range.trimStart) / narration.duration) * 100}%`,
          }}
        />
        <ProductRange
          aria-label={t('scenario.editor.tourSeek')}
          min={0}
          max={narration.duration}
          step={0.01}
          value={Math.max(0, Math.min(narration.duration, time))}
          disabled={disabled}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
        />
        {(['trimStart', 'trimEnd'] as const).map((edge) => {
          const label = t(
            edge === 'trimStart' ? 'scenario.editor.tourAudioStart' : 'scenario.editor.tourAudioEnd'
          );
          return (
            <button
              key={edge}
              type="button"
              role="slider"
              className="tour-narration-trim-handle"
              aria-label={label}
              aria-valuemin={edge === 'trimStart' ? 0 : range.trimStart + gap}
              aria-valuemax={edge === 'trimStart' ? range.trimEnd - gap : narration.duration}
              aria-valuenow={range[edge]}
              disabled={disabled || !onCommit}
              style={{ left: `${(range[edge] / narration.duration) * 100}%` }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.focus();
                active.current = {
                  edge,
                  pointerId: event.pointerId,
                  range: { trimStart: narration.trimStart, trimEnd: narration.trimEnd },
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (active.current?.pointerId === event.pointerId) move(event.clientX);
              }}
              onPointerUp={(event) => {
                if (active.current?.pointerId !== event.pointerId) return;
                move(event.clientX);
                const next = active.current.range;
                commit(next);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={cancel}
              onLostPointerCapture={() => {
                if (active.current) cancel();
              }}
              onKeyDown={(event) => {
                const delta =
                  event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                    ? -0.01
                    : event.key === 'ArrowRight' || event.key === 'ArrowUp'
                      ? 0.01
                      : null;
                if (delta === null && event.key !== 'Home' && event.key !== 'End') return;
                event.preventDefault();
                const value =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? narration.duration
                      : Math.round((range[edge] + (delta ?? 0)) * 100) / 100;
                commit(normalize(edge, value, range));
              }}
            />
          );
        })}
      </div>
      <div className="tour-narration-trim-values">
        {(['trimStart', 'trimEnd'] as const).map((edge) => (
          <label key={edge}>
            <span>
              {t(
                edge === 'trimStart'
                  ? 'scenario.editor.tourAudioStart'
                  : 'scenario.editor.tourAudioEnd'
              )}
            </span>
            <ProductInput
              type="number"
              aria-label={t(
                edge === 'trimStart'
                  ? 'scenario.editor.tourAudioStart'
                  : 'scenario.editor.tourAudioEnd'
              )}
              min={edge === 'trimStart' ? 0 : range.trimStart + gap}
              max={edge === 'trimStart' ? range.trimEnd - gap : narration.duration}
              step={0.01}
              value={range[edge]}
              disabled={disabled || !onCommit}
              onChange={(event) => {
                if (
                  event.currentTarget.value !== '' &&
                  Number.isFinite(event.currentTarget.valueAsNumber)
                )
                  preview(normalize(edge, event.currentTarget.valueAsNumber, range));
              }}
              onBlur={() => {
                if (draft) commit(draft);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancel();
                }
                if (event.key === 'Enter' && draft) {
                  event.preventDefault();
                  commit(draft);
                }
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
