import { readCatalogPresentation } from '../../../features/video/project/effect-bundle/catalog/presentation';
import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { describeCatalogDocument } from '../../../features/video/project/effect-bundle/catalog/query';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogDocumentEntry,
} from '../../../features/video/project/effect-bundle/catalog';
import { getCurrentLocale, translate } from '../../../platform/i18n';
import { EffectCatalogPreview } from '../../../ui/effect-catalog-preview';
import type { VideoEditorEffectsLibraryDockProps } from './types';
import type { EffectLibraryOperations } from './operations';

export function AnnotationSourcePreview(
  props: VideoEditorEffectsLibraryDockProps &
    Pick<EffectLibraryOperations, 'run'> & {
      catalog: EffectBundleCatalogEntry;
      document: EffectBundleCatalogDocumentEntry;
      disabled: boolean;
      onClose(): void;
    }
) {
  const [duration, setDuration] = useState(
    () => readCatalogPresentation(props.document)?.duration ?? 4
  );
  const [time, setTime] = useState(0);
  const currentTime = useRef(time);
  currentTime.current = time;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const initial = currentTime.current;
    const timer = setInterval(() => {
      const next = Math.min(duration, initial + (performance.now() - started) / 1000);
      setTime(next);
      if (next >= duration) setPlaying(false);
    }, 1000 / 15);
    return () => clearInterval(timer);
  }, [playing, duration]);
  const apply = (startTime: number) =>
    void props.run('apply', () =>
      props.onApplyEffect({
        catalog: props.catalog,
        documentId: props.document.id,
        ...(props.document.previewPresetId
          ? { controlPresetId: props.document.previewPresetId }
          : {}),
        startTime,
        standaloneDuration: duration,
        target: { kind: 'scene' },
        ...(props.selectedTrackId ? { trackId: props.selectedTrackId } : {}),
      })
    );
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      data-ui="video-editor.annotation-source-preview"
    >
      <div className="flex items-center gap-2">
        <EditorIconButton
          title={translate('videoEditor.effectsLibrary.backToCatalog')}
          onClick={props.onClose}
        >
          <ArrowLeft size={16} />
        </EditorIconButton>
        <h3 className="min-w-0 break-words text-sm font-medium">
          {describeCatalogDocument(props.document, getCurrentLocale()).label}
        </h3>
      </div>
      <EffectCatalogPreview
        catalog={props.catalog}
        document={props.document}
        expanded
        progress={time / duration}
      />
      <div className="flex items-center gap-2">
        <EditorIconButton
          title={translate(
            playing
              ? 'videoEditor.effectsLibrary.previewPause'
              : 'videoEditor.effectsLibrary.previewPlay'
          )}
          onClick={() => {
            if (!playing && time >= duration) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </EditorIconButton>
        <input
          className="min-w-0 flex-1"
          type="range"
          aria-label={translate('videoEditor.effectsLibrary.previewPosition')}
          min={0}
          max={duration}
          step={0.01}
          value={time}
          onChange={(event) => {
            setPlaying(false);
            setTime(Number(event.target.value));
          }}
        />
        <span className="text-xs tabular-nums">
          {`${time.toFixed(1)} / ${duration.toFixed(1)}`}
        </span>
      </div>
      <label className="flex items-center justify-between gap-2 text-xs">
        {translate('videoEditor.effectsLibrary.fxDuration')}
        <input
          className={[
            'w-20 rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
            'bg-transparent px-2 py-1 text-right',
          ].join(' ')}
          type="number"
          min={0.1}
          max={3600}
          step={0.1}
          value={duration}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (!Number.isFinite(value) || value < 0.1 || value > 3600) return;
            setPlaying(false);
            setDuration(value);
            setTime(Math.min(time, value));
          }}
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-2">
        <button
          className="rounded-[4px] px-2 py-1 text-xs hover:bg-[var(--sniptale-color-surface-hover)]"
          disabled={props.disabled}
          onClick={() => apply(props.currentTime)}
        >
          {translate('videoEditor.effectsLibrary.applyToScene')}
        </button>
        {props.appendTime !== undefined && (
          <button
            className="rounded-[4px] px-2 py-1 text-xs hover:bg-[var(--sniptale-color-surface-hover)]"
            disabled={props.disabled}
            onClick={() => apply(props.appendTime!)}
          >
            {translate('videoEditor.app.materialsAppend')}
          </button>
        )}
      </div>
    </section>
  );
}
