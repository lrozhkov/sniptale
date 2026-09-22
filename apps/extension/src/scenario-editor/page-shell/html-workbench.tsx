import { GuideReadingControls } from './reader-navigation';
import { DEFAULT_GUIDE_READING, type GuideReadingOptions } from './reader-pages';
import { formatBytes } from '../../platform/i18n/format-bytes';
import { type ReactNode, useState } from 'react';
import {
  BookOpen,
  Check,
  Circle,
  Download,
  Images,
  RotateCcw,
  SlidersHorizontal,
  X,
  ZoomIn,
} from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import {
  changeHtmlImageSettings,
  guideHtmlImages,
  resolveHtmlImageSettings,
} from './html-image-settings';
import { GuideHtmlImageFields } from './html-image-fields';
import { GuideInspectorGroup } from './inspector';
import { GuideExportWorkspace } from './export-workspace';
import { useHtmlExportJob, useHtmlImagePreview } from './html-workbench-state';
import './html-workbench.css';

/** Full-page output preparation keeps guide defaults and occurrence overrides visibly separate. */
export function GuideHtmlWorkbench({
  project,
  images,
  onChange,
  onClose,
  feedback,
  initialReading = DEFAULT_GUIDE_READING,
  t,
}: {
  project: GuideProject;
  images: Record<string, string | null>;
  onChange: (project: GuideProject) => void;
  onClose: () => void;
  feedback?: ReactNode;
  initialReading?: GuideReadingOptions;
  t: Translate;
}) {
  const [reading, setReading] = useState(initialReading);
  const entries = guideHtmlImages(project);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(entries[0]?.block.id);
  const [scope, setScope] = useState<'common' | 'selected'>('common');
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit');
  const block = entries.find((entry) => entry.block.id === active)?.block;
  const { preview, failed } = useHtmlImagePreview(project, block);
  const job = useHtmlExportJob(project, t, reading);
  const busy = job.status === 'pending';
  return (
    <GuideExportWorkspace
      preferenceScope="guide-html"
      className="guide-html-workbench"
      title={t('scenario.editor.htmlImages')}
      backLabel={t('scenario.editor.htmlBack')}
      headingMeta={
        job.measurement ? <output>{formatBytes(job.measurement.size)}</output> : undefined
      }
      stageLabel={t('scenario.editor.htmlPreview')}
      onClose={onClose}
      stage={
        <div className="guide-html-preview-image" data-zoom={zoom}>
          {preview ? (
            <img src={preview.url} alt={block?.alt ?? ''} />
          ) : (
            <p role="status">
              {t(
                !block
                  ? 'scenario.editor.htmlEmpty'
                  : failed
                    ? 'scenario.editor.htmlPreviewFailed'
                    : 'scenario.editor.htmlPreviewLoading'
              )}
            </p>
          )}
        </div>
      }
      inspector={
        <>
          <GuideInspectorGroup
            id="readerMode"
            icon={BookOpen}
            title={t('scenario.editor.guideReaderMode')}
          >
            <GuideReadingControls value={reading} onChange={setReading} disabled={busy} t={t} />
          </GuideInspectorGroup>
          <GuideInspectorGroup
            id="htmlImages"
            icon={Images}
            title={t('scenario.editor.htmlImages')}
          >
            <GuideHtmlImageList
              project={project}
              images={images}
              active={active}
              selected={selected}
              busy={busy}
              onActive={setActive}
              onSelected={(next) => {
                setSelected(next);
                setScope('selected');
              }}
              t={t}
            />
          </GuideInspectorGroup>
          <GuideHtmlPreviewSettings zoom={zoom} onZoom={setZoom} preview={preview} t={t} />
          <GuideHtmlSettings
            project={project}
            selected={selected}
            scope={scope}
            onScope={setScope}
            job={job}
            onChange={onChange}
            t={t}
          />
          <p className="guide-html-hint">{t('scenario.editor.htmlMeasureHint')}</p>
          {feedback}
        </>
      }
      status={
        job.status === 'idle' ? undefined : (
          <p
            role="status"
            className="guide-export-status"
            data-tone={
              job.status === 'failed' || job.status === 'history-failed' ? 'error' : undefined
            }
          >
            {t(exportStatusMessages[job.status])}
          </p>
        )
      }
      actions={
        <>
          <ProductActionButton
            tone="secondary"
            title={t('scenario.editor.htmlMeasure')}
            disabled={busy}
            onClick={() => void job.run(false)}
          >
            {t('scenario.editor.htmlMeasure')}
          </ProductActionButton>
          <ProductActionButton
            title={t('scenario.editor.htmlSave')}
            disabled={busy || !job.measurement}
            onClick={() => void job.run(true)}
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

function GuideHtmlImageList({
  project,
  images,
  active,
  selected,
  busy,
  onActive,
  onSelected,
  t,
}: {
  project: GuideProject;
  images: Record<string, string | null>;
  active: string | undefined;
  selected: Set<string>;
  busy: boolean;
  onActive: (id: string) => void;
  onSelected: (ids: Set<string>) => void;
  t: Translate;
}) {
  const entries = guideHtmlImages(project);
  return (
    <div className="guide-html-list">
      <ContentToolbarButton
        className="guide-labeled-action"
        title={t('scenario.editor.htmlSelectAll')}
        aria-pressed={entries.length > 0 && selected.size === entries.length}
        disabled={!entries.length || busy}
        onClick={() => {
          onSelected(
            selected.size === entries.length
              ? new Set()
              : new Set(entries.map((entry) => entry.block.id))
          );
        }}
      >
        <Check size={16} aria-hidden="true" />
        <span>{t('scenario.editor.htmlSelectAll')}</span>
      </ContentToolbarButton>
      {entries.map((entry, index) => (
        <div
          key={entry.block.id}
          className="guide-html-entry"
          data-active={entry.block.id === active}
        >
          <ContentToolbarButton
            className="guide-labeled-action"
            title={`${t('scenario.editor.htmlSelect')} ${index + 1}`}
            aria-pressed={selected.has(entry.block.id)}
            disabled={busy}
            onClick={() => {
              const next = new Set(selected);
              if (next.has(entry.block.id)) next.delete(entry.block.id);
              else next.add(entry.block.id);
              onSelected(next);
            }}
          >
            {selected.has(entry.block.id) ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Circle size={14} aria-hidden="true" />
            )}
          </ContentToolbarButton>
          <button
            type="button"
            className="guide-html-thumbnail"
            aria-current={entry.block.id === active}
            onClick={() => onActive(entry.block.id)}
          >
            {images[entry.block.assetId] && <img src={images[entry.block.assetId]!} alt="" />}
            <span>
              {index + 1}.{' '}
              {entry.block.caption || entry.title || t('scenario.editor.guideStepTitle')}
              <small>
                {t(
                  entry.block.htmlExport
                    ? 'scenario.editor.htmlException'
                    : 'scenario.editor.htmlInherit'
                )}
              </small>
            </span>
          </button>
        </div>
      ))}
      {!entries.length && <p className="guide-html-hint">{t('scenario.editor.htmlEmpty')}</p>}
    </div>
  );
}
function GuideHtmlSettings({
  project,
  selected,
  scope,
  onScope,
  job,
  onChange,
  t,
}: {
  project: GuideProject;
  selected: Set<string>;
  scope: 'common' | 'selected';
  onScope: (scope: 'common' | 'selected') => void;
  job: ReturnType<typeof useHtmlExportJob>;
  onChange: (project: GuideProject) => void;
  t: Translate;
}) {
  const entries = guideHtmlImages(project);
  const chosen = entries.filter((entry) => selected.has(entry.block.id));
  const value = resolveHtmlImageSettings(
    project,
    scope === 'selected' ? chosen[0]?.block : undefined
  );
  const mixed =
    scope === 'selected' &&
    chosen.some(
      (entry) =>
        JSON.stringify(resolveHtmlImageSettings(project, entry.block)) !== JSON.stringify(value)
    );
  const busy = job.status === 'pending';
  const common = scope === 'common';
  const title = t(common ? 'scenario.editor.htmlCommon' : 'scenario.editor.htmlSelected');
  const resetTitle = t(common ? 'scenario.editor.htmlResetAll' : 'scenario.editor.htmlReset');
  const unavailable = busy || (!common && !chosen.length);
  return (
    <GuideInspectorGroup id="html-workbench" icon={SlidersHorizontal} title={title}>
      <SegmentedSwitch
        density="compact"
        ariaLabel={t('scenario.editor.htmlImages')}
        activeId={scope}
        options={[
          { id: 'common', label: t('scenario.editor.htmlCommon') },
          { id: 'selected', label: `${t('scenario.editor.htmlSelected')} (${selected.size})` },
        ]}
        onChange={onScope}
      />
      {mixed && <p className="guide-html-hint">{t('scenario.editor.htmlMixed')}</p>}
      <GuideHtmlImageFields
        value={value}
        disabled={unavailable}
        onChange={(patch) =>
          onChange(
            scope === 'common'
              ? { ...project, htmlExport: { ...value, ...patch } }
              : changeHtmlImageSettings(project, selected, patch)
          )
        }
        t={t}
      />
      <ContentToolbarButton
        className="guide-labeled-action"
        title={resetTitle}
        disabled={unavailable}
        onClick={() =>
          onChange(
            changeHtmlImageSettings(
              project,
              scope === 'common' ? new Set(entries.map((entry) => entry.block.id)) : selected,
              null
            )
          )
        }
      >
        <RotateCcw size={14} aria-hidden="true" />
        <span>{resetTitle}</span>
      </ContentToolbarButton>
    </GuideInspectorGroup>
  );
}

const exportStatusMessages = {
  pending: 'scenario.editor.guideHtmlPreparing',
  saved: 'scenario.editor.guideHtmlSaved',
  'history-failed': 'scenario.editor.guideHtmlHistoryFailed',
  failed: 'scenario.editor.guideHtmlFailed',
} as const;

/** Preview controls affect inspection scale, independently of export preparation. */
function GuideHtmlPreviewSettings({
  zoom,
  onZoom,
  preview,
  t,
}: {
  zoom: 'fit' | 'full';
  onZoom(value: 'fit' | 'full'): void;
  preview: ReturnType<typeof useHtmlImagePreview>['preview'];
  t: Translate;
}) {
  return (
    <GuideInspectorGroup id="htmlPreview" icon={ZoomIn} title={t('scenario.editor.htmlPreview')}>
      <SegmentedSwitch
        density="compact"
        ariaLabel={t('scenario.editor.htmlPreview')}
        activeId={zoom}
        options={[
          { id: 'fit', label: t('scenario.editor.htmlFit') },
          { id: 'full', label: '100%' },
        ]}
        onChange={onZoom}
      />
      {preview && (
        <p className="guide-html-preview-meta">
          {`${preview.width} × ${preview.height} · ${formatBytes(preview.size)}`}
        </p>
      )}
    </GuideInspectorGroup>
  );
}
