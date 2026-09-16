import { GuideReadingControls } from './reader-navigation';
import { DEFAULT_GUIDE_READING, type GuideReadingOptions } from './reader-pages';
import { formatBytes } from '../../platform/i18n/format-bytes';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Circle, Download, Image, RotateCcw, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
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
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    back.current?.focus();
  }, []);
  const busy = job.status === 'pending';
  return (
    <main
      className="guide-html-workbench"
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
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t('scenario.editor.htmlBack')}</span>
        </ContentToolbarButton>
        <h1>{t('scenario.editor.htmlImages')}</h1>
        {job.measurement && <output>{formatBytes(job.measurement.size)}</output>}
        <ContentToolbarButton
          className="guide-labeled-action"
          title={t('scenario.editor.htmlMeasure')}
          disabled={busy}
          onClick={() => void job.run(false)}
        >
          <span>{t('scenario.editor.htmlMeasure')}</span>
        </ContentToolbarButton>
        <ContentToolbarButton
          className="guide-labeled-action"
          title={t('scenario.editor.htmlSave')}
          disabled={busy || !job.measurement}
          onClick={() => void job.run(true)}
        >
          <Download size={16} aria-hidden="true" />
          <span>{t('scenario.editor.htmlSave')}</span>
        </ContentToolbarButton>
        {busy && (
          <ContentToolbarButton
            className="guide-labeled-action"
            title={t('common.actions.cancel')}
            onClick={job.cancel}
          >
            <X size={16} aria-hidden="true" />
          </ContentToolbarButton>
        )}
      </header>
      <GuideReadingControls value={reading} onChange={setReading} disabled={busy} t={t} />
      <div className="guide-html-body">
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
        <section className="guide-html-preview" aria-label={t('scenario.editor.htmlPreview')}>
          <header>
            <span>
              {preview && `${preview.width} × ${preview.height} · ${formatBytes(preview.size)}`}
            </span>
            <SegmentedSwitch
              density="compact"
              ariaLabel={t('scenario.editor.htmlPreview')}
              activeId={zoom}
              options={[
                { id: 'fit', label: t('scenario.editor.htmlFit') },
                { id: 'full', label: '100%' },
              ]}
              onChange={setZoom}
            />
          </header>
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
        </section>
        <GuideHtmlSettings
          project={project}
          feedback={feedback}
          selected={selected}
          scope={scope}
          onScope={setScope}
          job={job}
          onChange={onChange}
          t={t}
        />
      </div>
    </main>
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
    <aside className="guide-html-list" aria-label={t('scenario.editor.htmlImages')}>
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
      {!entries.length && <p>{t('scenario.editor.htmlEmpty')}</p>}
    </aside>
  );
}
function GuideHtmlSettings({
  project,
  feedback,
  selected,
  scope,
  onScope,
  job,
  onChange,
  t,
}: {
  project: GuideProject;
  feedback?: ReactNode;
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
    <aside className="guide-html-settings">
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
      <GuideInspectorGroup icon={Image} title={title}>
        {mixed && <p>{t('scenario.editor.htmlMixed')}</p>}
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
      <p>{t('scenario.editor.htmlMeasureHint')}</p>
      {feedback}
      {job.status !== 'idle' && <p role="status">{t(exportStatusMessages[job.status])}</p>}
    </aside>
  );
}

const exportStatusMessages = {
  pending: 'scenario.editor.guideHtmlPreparing',
  saved: 'scenario.editor.guideHtmlSaved',
  'history-failed': 'scenario.editor.guideHtmlHistoryFailed',
  failed: 'scenario.editor.guideHtmlFailed',
} as const;
