import { SelectField } from '../../../ui/compact-inspector-controls/controls';
import { TourExportPreview } from './export-preview';
import { useState } from 'react';
import { Download, Image, MonitorSmartphone, Play, RotateCcw, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GuideExportWorkspace } from '../export-workspace';
import { GuideInspectorGroup } from '../inspector';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { useTourHtmlExport } from './export-state';
import type { TourHtmlBlocker } from '../runtime/tour-html';
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
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [replay, setReplay] = useState(0);
  const busy = job.status === 'preparing' || job.status === 'saving';
  return (
    <GuideExportWorkspace
      preferenceScope="tour-html"
      className="tour-export"
      title={t('scenario.editor.tourHtmlTitle')}
      backLabel={t('scenario.editor.guideReaderBack')}
      headingMeta={
        job.ready ? <output>{formatBytes(job.ready.artifact.blob.size)}</output> : undefined
      }
      stageLabel={t('scenario.editor.tourHtmlPreview')}
      onClose={onClose}
      stage={
        <div className="tour-export-frame" data-viewport={viewport}>
          {job.ready ? (
            <TourExportPreview
              key={`${job.ready.version}:${replay}`}
              blob={job.ready.artifact.blob}
              title={t('scenario.editor.tourHtmlPreview')}
            />
          ) : job.status === 'preparing' ? (
            <p className="tour-export-progress" role="status">
              {t('scenario.editor.guideHtmlPreparing')}
              {job.progress.total ? ` ${job.progress.done} / ${job.progress.total}` : ''}
            </p>
          ) : (
            <div className="tour-export-idle">
              <ProductActionButton
                title={t('scenario.editor.tourHtmlPrepare')}
                onClick={() => void job.prepare()}
              >
                <Play size={16} aria-hidden="true" />
                {t('scenario.editor.tourHtmlPrepare')}
              </ProductActionButton>
              <p>{t('scenario.editor.tourHtmlPrepareHint')}</p>
            </div>
          )}
        </div>
      }
      inspector={
        <>
          <GuideInspectorGroup
            id="htmlPreview"
            icon={MonitorSmartphone}
            title={t('scenario.editor.tourHtmlPreview')}
          >
            <SelectField
              label={t('scenario.editor.tourHtmlPreview')}
              value={viewport}
              options={[
                { value: 'desktop', label: t('scenario.editor.tourHtmlDesktop') },
                { value: 'mobile', label: t('scenario.editor.tourHtmlMobile') },
              ]}
              onChange={setViewport}
            />
            <ContentToolbarButton
              className="guide-labeled-action"
              title={t('scenario.editor.tourCameraReplay')}
              disabled={!job.ready}
              onClick={() => setReplay((value) => value + 1)}
            >
              <RotateCcw size={16} aria-hidden="true" />
              <span>{t('scenario.editor.tourCameraReplay')}</span>
            </ContentToolbarButton>
          </GuideInspectorGroup>
          <GuideInspectorGroup id="htmlImages" icon={Image} title={t('scenario.editor.htmlImages')}>
            <TourImageSettings t={t} options={options} busy={busy} onChange={setOptions} />
          </GuideInspectorGroup>
          <div className="tour-export-notes">
            <p>{t('scenario.editor.tourHtmlMediaHint')}</p>
            <p>{t('scenario.editor.tourHtmlLimitHint')}</p>
          </div>
        </>
      }
      status={
        job.status === 'idle' || job.status === 'preparing' ? undefined : (
          <p
            role="status"
            aria-live="polite"
            className="guide-export-status"
            data-tone={
              job.status === 'failed' || job.status === 'history-failed' ? 'error' : undefined
            }
          >
            {job.status === 'saving' ? (
              t('scenario.editor.guideHtmlPreparing')
            ) : job.status === 'failed' ? (
              <TourExportFailure blocker={job.blocker} t={t} />
            ) : job.status === 'saved' ? (
              t('scenario.editor.guideHtmlSaved')
            ) : (
              t('scenario.editor.guideHtmlHistoryFailed')
            )}
          </p>
        )
      }
      actions={
        <>
          <ProductActionButton
            tone="secondary"
            title={t('scenario.editor.tourHtmlPrepare')}
            disabled={busy}
            onClick={() => void job.prepare()}
          >
            <Play size={16} aria-hidden="true" />
            {t('scenario.editor.tourHtmlPrepare')}
          </ProductActionButton>
          <ProductActionButton
            title={t('scenario.editor.htmlSave')}
            disabled={busy || !job.ready}
            onClick={() => void job.save()}
          >
            <Download size={16} aria-hidden="true" />
            {t('scenario.editor.htmlSave')}
          </ProductActionButton>
          {busy && (
            <ProductActionButton
              tone="secondary"
              title={t('common.actions.cancel')}
              onClick={job.cancel}
            >
              <X size={16} aria-hidden="true" />
              {t('common.actions.cancel')}
            </ProductActionButton>
          )}
        </>
      }
    />
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
      <SelectField
        label={t('scenario.editor.htmlImages')}
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
          <div className="tour-export-field">
            <SelectField
              label={t('scenario.editor.tourHtmlResolution')}
              value={String(options.maxEdge)}
              disabled={busy}
              options={[1280, 1920, 2560, 3840].map((value) => ({
                value: String(value),
                label: `${value} px`,
              }))}
              onChange={(maxEdge) => onChange({ ...options, maxEdge: Number(maxEdge) })}
            />
          </div>
          <div className="tour-export-field">
            <SelectField
              label={t('scenario.editor.tourHtmlQuality')}
              value={String(options.quality)}
              disabled={busy}
              options={[0.75, 0.85, 0.95].map((value) => ({
                value: String(value),
                label: `${Math.round(value * 100)}%`,
              }))}
              onChange={(quality) => onChange({ ...options, quality: Number(quality) })}
            />
          </div>
        </>
      )}
    </>
  );
}

/** Localized fixed reasons and authored labels explain recovery without exposing exception text. */
function TourExportFailure({ blocker, t }: { blocker: TourHtmlBlocker | null; t: Translate }) {
  if (!blocker) return t('scenario.editor.tourHtmlFailed');
  const messages = {
    invalid: 'scenario.editor.tourHtmlBlockerInvalid',
    unsupported: 'scenario.editor.tourHtmlBlockerUnsupported',
    noActions: 'scenario.editor.tourHtmlBlockerNoActions',
    invalidOptions: 'scenario.editor.tourHtmlBlockerInvalidOptions',
    missingImage: 'scenario.editor.tourHtmlBlockerMissingImage',
    targetReview: 'scenario.editor.tourHtmlBlockerTargetReview',
    missingTarget: 'scenario.editor.tourHtmlBlockerMissingTarget',
    missingImageMedia: 'scenario.editor.tourHtmlBlockerMissingImageMedia',
    missingAudioMedia: 'scenario.editor.tourHtmlBlockerMissingAudioMedia',
    conflictingMedia: 'scenario.editor.tourHtmlBlockerConflictingMedia',
    rasterFailed: 'scenario.editor.tourHtmlBlockerRasterFailed',
    mediaBudget: 'scenario.editor.tourHtmlBlockerMediaBudget',
  } as const;
  const context = [
    blocker.slideNumber
      ? t('scenario.editor.tourHtmlBlockerSlide')
          .replace('{number}', String(blocker.slideNumber))
          .replace('{title}', blocker.slideTitle?.trim() || '—')
      : '',
    blocker.actionNumber
      ? t('scenario.editor.tourHtmlBlockerAction').replace('{number}', String(blocker.actionNumber))
      : '',
    blocker.buttonLabel
      ? t('scenario.editor.tourHtmlBlockerButton').replace('{label}', blocker.buttonLabel)
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      {context && (
        <>
          <strong>{context}</strong>
          <br />
        </>
      )}
      {t(messages[blocker.code])}
    </>
  );
}
