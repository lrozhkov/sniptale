import { TourExportPreview } from './export-preview';
import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Play, RotateCcw, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { useTourHtmlExport } from './export-state';
import type { TourHtmlImageOptions } from '../runtime/tour-html-images';
import './export.css';

/** The isolated iframe and native save share the exact prepared file, not an editor scene. */
export function TourHtmlExport({
  project,
  t,
  onClose,
}: {
  project: GuideProject;
  t: Translate;
  onClose: () => void;
}) {
  const [options, setOptions] = useState({ optimize: false, maxEdge: 1920, quality: 0.85 });
  const job = useTourHtmlExport(project, options, t);
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    back.current?.focus();
  }, []);
  const busy = job.status === 'preparing' || job.status === 'saving';
  return (
    <main
      className="guide-page tour-export"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="guide-page-header">
        <ContentToolbarButton
          className="guide-labeled-action"
          ref={back}
          title={t('scenario.editor.htmlBack')}
          onClick={onClose}
        >
          <ArrowLeft size={16} />
          <span>{t('scenario.editor.htmlBack')}</span>
        </ContentToolbarButton>
        <h1>{t('scenario.editor.tourHtmlTitle')}</h1>
        {job.ready && <output>{formatBytes(job.ready.artifact.blob.size)}</output>}
        <ContentToolbarButton
          className="guide-labeled-action"
          title={t('scenario.editor.tourHtmlPrepare')}
          disabled={busy}
          onClick={() => void job.prepare()}
        >
          <Play size={16} />
          <span>{t('scenario.editor.tourHtmlPrepare')}</span>
        </ContentToolbarButton>
        <ContentToolbarButton
          className="guide-labeled-action"
          title={t('scenario.editor.htmlSave')}
          disabled={busy || !job.ready}
          onClick={() => void job.save()}
        >
          <Download size={16} />
          <span>{t('scenario.editor.htmlSave')}</span>
        </ContentToolbarButton>
        {busy && (
          <ContentToolbarButton title={t('common.actions.cancel')} onClick={job.cancel}>
            <X size={16} />
          </ContentToolbarButton>
        )}
      </header>
      <div className="tour-export-body">
        <TourPreviewPanel ready={job.ready} busy={busy} t={t} />
        <aside className="tour-export-settings">
          <TourImageSettings t={t} options={options} busy={busy} onChange={setOptions} />
          <p>{t('scenario.editor.tourHtmlMediaHint')}</p>
          <p>{t('scenario.editor.tourHtmlMaskHint')}</p>
          <p>{t('scenario.editor.tourHtmlLimitHint')}</p>
          <p role="status" aria-live="polite">
            {busy
              ? `${t('scenario.editor.guideHtmlPreparing')} ${job.progress.done} / ${job.progress.total}`
              : job.status === 'failed'
                ? t('scenario.editor.tourHtmlFailed')
                : job.status === 'saved'
                  ? t('scenario.editor.guideHtmlSaved')
                  : job.status === 'history-failed'
                    ? t('scenario.editor.guideHtmlHistoryFailed')
                    : ''}
          </p>
        </aside>
      </div>
    </main>
  );
}

/** Image preparation controls share one disposable export policy. */
function TourImageSettings({
  t,
  options,
  busy,
  onChange,
}: {
  t: Translate;
  options: TourHtmlImageOptions;
  busy: boolean;
  onChange: (options: TourHtmlImageOptions) => void;
}) {
  return (
    <>
      <h2>{t('scenario.editor.htmlImages')}</h2>
      <CompactSelect
        aria-label={t('scenario.editor.htmlImages')}
        value={options.optimize ? 'optimized' : 'original'}
        disabled={busy}
        options={[
          { value: 'original', label: t('scenario.editor.tourHtmlOriginal') },
          { value: 'optimized', label: t('scenario.editor.tourHtmlOptimized') },
        ]}
        onChange={(value) => onChange({ ...options, optimize: value === 'optimized' })}
      />
      {options.optimize && (
        <>
          <label>
            {t('scenario.editor.tourHtmlResolution')}
            <CompactSelect
              aria-label={t('scenario.editor.tourHtmlResolution')}
              value={String(options.maxEdge)}
              disabled={busy}
              options={[1280, 1920, 2560, 3840].map((value) => ({
                value: String(value),
                label: `${value} px`,
              }))}
              onChange={(maxEdge) => onChange({ ...options, maxEdge: Number(maxEdge) })}
            />
          </label>
          <label>
            {t('scenario.editor.tourHtmlQuality')}
            <CompactSelect
              aria-label={t('scenario.editor.tourHtmlQuality')}
              value={String(options.quality)}
              disabled={busy}
              options={[0.75, 0.85, 0.95].map((value) => ({
                value: String(value),
                label: `${Math.round(value * 100)}%`,
              }))}
              onChange={(quality) => onChange({ ...options, quality: Number(quality) })}
            />
          </label>
        </>
      )}
    </>
  );
}

/** Viewport and replay are local preview state, independent of artifact preparation. */
function TourPreviewPanel({
  ready,
  busy,
  t,
}: {
  ready: ReturnType<typeof useTourHtmlExport>['ready'];
  busy: boolean;
  t: Translate;
}) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [replay, setReplay] = useState(0);
  return (
    <section className="tour-export-preview" aria-label={t('scenario.editor.tourHtmlPreview')}>
      <header>
        <CompactSelect
          aria-label={t('scenario.editor.tourHtmlPreview')}
          value={viewport}
          options={[
            { value: 'desktop', label: t('scenario.editor.tourHtmlDesktop') },
            { value: 'mobile', label: t('scenario.editor.tourHtmlMobile') },
          ]}
          onChange={setViewport}
        />
        <ContentToolbarButton
          title={t('scenario.editor.tourCameraReplay')}
          disabled={!ready}
          onClick={() => setReplay((value) => value + 1)}
        >
          <RotateCcw size={16} />
        </ContentToolbarButton>
      </header>
      <div className="tour-export-frame" data-viewport={viewport}>
        {ready ? (
          <TourExportPreview
            key={`${ready.version}:${replay}`}
            blob={ready.artifact.blob}
            title={t('scenario.editor.tourHtmlPreview')}
          />
        ) : (
          <p>
            {t(busy ? 'scenario.editor.guideHtmlPreparing' : 'scenario.editor.tourHtmlPrepareHint')}
          </p>
        )}
      </div>
    </section>
  );
}
