import { Download, FolderArchive, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  SUPPORT_MEDIA_HUB_BACKUP_EXPORT_OPTIONS,
  createMediaHubBackupExportOptions,
  type MediaHubBackupExportOptions,
} from '../../../workflows/media-hub-backup/index';
import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { GalleryModalFrame } from './frame';
import type { BackupExportModalProps } from './types';

const exportBadgeClassName =
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_34%,var(--sniptale-color-border-soft)_66%)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning)_12%,transparent)] text-[var(--sniptale-color-warning)]';

const statClassName =
  'rounded-[12px] border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-3 py-3';

const toggleClassName =
  'flex items-start gap-3 rounded-[12px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[var(--sniptale-color-surface-panel)] px-3 py-3 text-left text-sm';

function SummaryStat(props: { label: string; value: string | number }) {
  return (
    <div className={statClassName}>
      <div className="text-xs uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
        {props.label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[var(--sniptale-color-text-primary)]">
        {props.value}
      </div>
    </div>
  );
}

function DataClassRow(props: { count: number; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{props.label}</span>
      <span className="font-mono text-xs text-[var(--sniptale-color-text-muted)]">
        {props.count}
      </span>
    </div>
  );
}

function PrivacyToggle(props: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={toggleClassName}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        <span className="block font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.label}
        </span>
        <span className="mt-1 block text-xs text-[var(--sniptale-color-text-secondary)]">
          {props.description}
        </span>
      </span>
    </label>
  );
}

function updateOption(
  options: MediaHubBackupExportOptions,
  patch: Partial<MediaHubBackupExportOptions>
): MediaHubBackupExportOptions {
  return createMediaHubBackupExportOptions({ ...options, ...patch });
}

function BackupExportSummaryGrid(props: {
  options: MediaHubBackupExportOptions;
  summary: BackupExportModalProps['summary'];
}) {
  const scopeLabel =
    props.options.scope === 'selected'
      ? translate('gallery.backupExportModal.scopeSelected')
      : translate('gallery.backupExportModal.scopeAll');

  return (
    <div className="mt-5 grid gap-3 md:grid-cols-4">
      <SummaryStat
        label={translate('gallery.backupExportModal.assets')}
        value={props.summary.assetCount}
      />
      <SummaryStat
        label={translate('gallery.backupExportModal.projects')}
        value={props.summary.videoProjectCount + props.summary.scenarioProjectCount}
      />
      <SummaryStat
        label={translate('gallery.backupExportModal.approximateSize')}
        value={formatBytes(props.summary.approximateSizeBytes, 1)}
      />
      <SummaryStat label={translate('gallery.backupExportModal.scope')} value={scopeLabel} />
    </div>
  );
}

function BackupDataClassesPanel({ summary }: Pick<BackupExportModalProps, 'summary'>) {
  return (
    <div className="mt-5 rounded-[12px] border border-[var(--sniptale-color-border-soft)] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        <ShieldCheck className="h-4 w-4 text-[var(--sniptale-color-success)]" />
        {translate('gallery.backupExportModal.dataClassesTitle')}
      </div>
      <div className="mt-3 grid gap-2 text-sm text-[var(--sniptale-color-text-secondary)] md:grid-cols-2">
        <DataClassRow
          count={summary.assetCount}
          label={translate('gallery.backupExportModal.classMedia')}
        />
        <DataClassRow
          count={summary.videoProjectCount + summary.scenarioProjectCount}
          label={translate('gallery.backupExportModal.classProjects')}
        />
        <DataClassRow
          count={summary.sourceMetadataCount}
          label={translate('gallery.backupExportModal.classSourceMetadata')}
        />
        <DataClassRow
          count={summary.recordingCount}
          label={translate('gallery.backupExportModal.classTelemetry')}
        />
        <DataClassRow
          count={summary.editorDraftCount}
          label={translate('gallery.backupExportModal.classEditorDrafts')}
        />
        <DataClassRow
          count={summary.webSnapshotCount}
          label={translate('gallery.backupExportModal.classWebSnapshots')}
        />
      </div>
    </div>
  );
}

function BackupPrivacyOptionsGrid(props: {
  options: MediaHubBackupExportOptions;
  onChange: (patch: Partial<MediaHubBackupExportOptions>) => void;
}) {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <PrivacyToggle
        checked={props.options.includeTelemetry}
        label={translate('gallery.backupExportModal.includeTelemetry')}
        description={translate('gallery.backupExportModal.includeTelemetryDescription')}
        onChange={(includeTelemetry) => props.onChange({ includeTelemetry })}
      />
      <PrivacyToggle
        checked={props.options.includeSourceMetadata}
        label={translate('gallery.backupExportModal.includeSourceMetadata')}
        description={translate('gallery.backupExportModal.includeSourceMetadataDescription')}
        onChange={(includeSourceMetadata) => props.onChange({ includeSourceMetadata })}
      />
      <PrivacyToggle
        checked={props.options.includeWebSnapshots}
        label={translate('gallery.backupExportModal.includeWebSnapshots')}
        description={translate('gallery.backupExportModal.includeWebSnapshotsDescription')}
        onChange={(includeWebSnapshots) => props.onChange({ includeWebSnapshots })}
      />
      <PrivacyToggle
        checked={props.options.includeEditorDrafts}
        label={translate('gallery.backupExportModal.includeEditorDrafts')}
        description={translate('gallery.backupExportModal.includeEditorDraftsDescription')}
        onChange={(includeEditorDrafts) => props.onChange({ includeEditorDrafts })}
      />
    </div>
  );
}

function BackupExportActions(props: {
  options: MediaHubBackupExportOptions;
  onClose: () => void;
  onExport: (options: MediaHubBackupExportOptions) => void;
  onOptionsChange: (options: MediaHubBackupExportOptions) => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={() =>
          props.onOptionsChange(
            createMediaHubBackupExportOptions({
              ...SUPPORT_MEDIA_HUB_BACKUP_EXPORT_OPTIONS,
              scope: props.options.scope,
              ...(props.options.selected === undefined ? {} : { selected: props.options.selected }),
            })
          )
        }
        className="rounded-[12px] border border-[var(--sniptale-color-border-soft)] px-4 py-2 text-sm
          text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]"
      >
        {translate('gallery.backupExportModal.supportBundle')}
      </button>
      <button
        type="button"
        onClick={props.onClose}
        className="rounded-[12px] border border-[var(--sniptale-color-border-soft)] px-4 py-2 text-sm
          text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]"
      >
        {translate('common.actions.cancel')}
      </button>
      <button
        type="button"
        onClick={() => props.onExport(props.options)}
        className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--sniptale-color-accent)]
          bg-[var(--sniptale-color-accent-soft)] px-4 py-2 text-sm font-semibold
          text-[var(--sniptale-color-text-primary)]"
      >
        <Download className="h-4 w-4" />
        {translate('gallery.backupExportModal.export')}
      </button>
    </div>
  );
}

function useBackupExportDraft({
  onInspect,
  options,
  summary,
}: Pick<BackupExportModalProps, 'onInspect' | 'options' | 'summary'>) {
  const [draftOptions, setDraftOptions] = useState(options);
  const [currentSummary, setCurrentSummary] = useState(summary);

  useEffect(() => {
    setDraftOptions(options);
    setCurrentSummary(summary);
  }, [options, summary]);

  useEffect(() => {
    let isCurrent = true;

    void onInspect(draftOptions)
      .then((nextSummary) => {
        if (isCurrent) {
          setCurrentSummary(nextSummary);
        }
      })
      .catch(() => undefined);

    return () => {
      isCurrent = false;
    };
  }, [draftOptions, onInspect]);

  return { currentSummary, draftOptions, setDraftOptions };
}

export function BackupExportModalContent({
  options,
  onInspect,
  summary,
  onClose,
  onExport,
}: BackupExportModalProps) {
  const { currentSummary, draftOptions, setDraftOptions } = useBackupExportDraft({
    onInspect,
    options,
    summary,
  });

  return (
    <GalleryModalFrame
      badgeIcon={FolderArchive}
      badgeLabel={translate('gallery.backupExportModal.badge')}
      badgeClassName={exportBadgeClassName}
      title={translate('gallery.backupExportModal.title')}
      description={translate('gallery.backupExportModal.description')}
      maxWidthClassName="max-w-3xl"
      panelClassName="rounded-[16px]"
      titleClassName="text-2xl"
      onClose={onClose}
    >
      <BackupExportSummaryGrid options={draftOptions} summary={currentSummary} />
      <BackupDataClassesPanel summary={currentSummary} />
      <BackupPrivacyOptionsGrid
        options={draftOptions}
        onChange={(patch) => setDraftOptions((current) => updateOption(current, patch))}
      />
      <BackupExportActions
        options={draftOptions}
        onClose={onClose}
        onExport={(nextOptions) => void onExport(nextOptions)}
        onOptionsChange={setDraftOptions}
      />
    </GalleryModalFrame>
  );
}
