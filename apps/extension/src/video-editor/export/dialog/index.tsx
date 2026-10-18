import { useVideoExportSizeEstimate } from '../../../ui/video-export/use-size-estimate';
import { VideoExportSizeHint } from '../../../ui/video-export/size-estimate';
import { estimateProjectExportSize } from '../estimate-size';
import type { VideoProject } from '../../../features/video/project/types';
import React, { useId, useRef } from 'react';
import { Download, FileOutput } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { OptionRow } from '../../../ui/compact-inspector-controls';
import { VideoExportFormat } from '../../../features/video/project/types';
import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
  VideoProjectExportSettingsPatch,
} from '../../../features/video/project/types';
import { useExportDialogCapabilities } from './capability-state';
import { ExportDialogFields } from './fields';
import { ProjectSubtitles } from './subtitles';
import { useExportDialogFocus } from './focus';

interface ExportDialogProps {
  estimateContext?: { project: VideoProject; assetUrls: Record<string, string> } | undefined;
  selectedClipAvailable?: boolean;
  selectedRangeAvailable?: boolean;
  settings: VideoProjectExportSettings;
  sourceDimensions: { height: number; width: number };
  onClose: () => void;
  onChange: (patch: VideoProjectExportSettingsPatch) => void;
  onExport: () => void;
}

function ExportDialogHintCard(props: {
  capabilities: VideoExportCapabilities | null;
  capabilityError: string | null;
  capabilitiesPending: boolean;
  settings: VideoProjectExportSettings;
}) {
  const { capabilities, capabilityError, capabilitiesPending, settings } = props;
  const unavailable =
    capabilities?.mp4Codecs
      .filter((entry) => !entry.available)
      .map((entry) =>
        entry.codec === 'AVC' ? 'H.264' : entry.codec === 'HEVC' ? 'H.265' : 'VP9'
      ) ?? [];
  const hintMessage = capabilitiesPending
    ? translate('videoEditor.exportDialog.capabilityLoading')
    : settings.format === VideoExportFormat.MP4 && unavailable.length
      ? `${unavailable.join(', ')} — ${translate('videoEditor.exportDialog.codecUnavailable')}`
      : null;
  if (!hintMessage && !capabilityError) return null;

  return (
    <div className="text-xs leading-relaxed text-[var(--sniptale-color-text-muted)]">
      <p role="status">{hintMessage}</p>
      {capabilityError ? (
        <p className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.exportDialog.capabilityFallbackNote')} {capabilityError}
        </p>
      ) : null}
    </div>
  );
}

function ExportDialogBooleanToggle({
  checked,
  icon,
  label,
  onClick,
}: {
  checked: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <OptionRow
      active={checked}
      label={
        <span
          className="inline-flex min-w-0 items-center gap-2 text-[13px] leading-[18px] font-medium
            text-[var(--sniptale-color-text-primary)]"
        >
          {icon}
          {label}
        </span>
      }
      onToggle={onClick}
    />
  );
}

function ExportDialogDownloadToggle({
  settings,
  onChange,
}: {
  settings: VideoProjectExportSettings;
  onChange: (patch: VideoProjectExportSettingsPatch) => void;
}) {
  return (
    <ExportDialogBooleanToggle
      checked={settings.downloadAfterExport}
      icon={<Download size={16} strokeWidth={2} />}
      label={translate('videoEditor.exportDialog.downloadAfterExport')}
      onClick={() => onChange({ downloadAfterExport: !settings.downloadAfterExport })}
    />
  );
}

function ExportDialogActions(props: {
  disabled?: boolean;
  onClose: () => void;
  onExport: () => void;
}) {
  const { disabled = false, onClose, onExport } = props;
  return (
    <div className="ml-auto flex items-center gap-2">
      <ProductActionButton tone="secondary" onClick={onClose}>
        {translate('videoEditor.exportDialog.cancel')}
      </ProductActionButton>
      <ProductActionButton tone="primary" disabled={disabled} onClick={onExport}>
        <span className="inline-flex items-center gap-2">
          <FileOutput size={16} strokeWidth={2} />
          {translate('videoEditor.exportDialog.submit')}
        </span>
      </ProductActionButton>
    </div>
  );
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  estimateContext,
  selectedClipAvailable = false,
  selectedRangeAvailable = false,
  settings,
  sourceDimensions,
  onClose,
  onChange,
  onExport,
}) => {
  const { capabilities, capabilitiesPending, capabilityError } = useExportDialogCapabilities({
    settings,
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useExportDialogFocus(rootRef);
  const canExport =
    !capabilitiesPending &&
    !capabilityError &&
    !!capabilities?.formats.some((entry) => entry.format === settings.format && entry.available) &&
    (settings.format !== VideoExportFormat.MP4 ||
      capabilities.mp4Codecs.some(
        (entry) => entry.codec === settings.mp4VideoCodec && entry.available
      ));

  const estimate = useExportSizeEstimate(estimateContext, settings, canExport);

  return (
    <div ref={rootRef} className="contents">
      <ProductModal
        labelledBy={titleId}
        onClose={onClose}
        closeOnBackdrop
        width="min(480px, calc(100vw - 32px))"
      >
        <ProductModalHeader
          compact
          title={<span id={titleId}>{translate('videoEditor.exportDialog.title')}</span>}
          closeTitle={translate('common.actions.close')}
          onClose={onClose}
        />
        <ProductModalBody compact className="min-h-0 gap-3 overflow-y-auto">
          <ExportDialogFields
            capabilities={capabilities}
            settings={settings}
            sourceDimensions={sourceDimensions}
            onChange={onChange}
            selectedClipAvailable={selectedClipAvailable}
            selectedRangeAvailable={selectedRangeAvailable}
          />
          <ExportDialogHintCard
            capabilities={capabilities}
            capabilitiesPending={capabilitiesPending}
            capabilityError={capabilityError}
            settings={settings}
          />
          <ExportDialogDownloadToggle settings={settings} onChange={onChange} />
          {estimateContext ? <ProjectSubtitles project={estimateContext.project} /> : null}
        </ProductModalBody>
        <ExportDialogFooter
          settings={settings}
          estimate={estimate}
          disabled={!canExport}
          onClose={onClose}
          onExport={onExport}
        />
      </ProductModal>
    </div>
  );
};

/** The cache identity includes only content and settings that change encoded bytes. */
function useExportSizeEstimate(
  estimateContext: ExportDialogProps['estimateContext'],
  settings: VideoProjectExportSettings,
  canExport: boolean
) {
  const estimateKey =
    canExport && estimateContext && settings.frameRateMode !== 'adaptive'
      ? JSON.stringify([
          estimateContext.project,
          estimateContext.assetUrls,
          settings.format,
          settings.mp4VideoCodec,
          settings.webmVideoCodec,
          settings.width,
          settings.height,
          settings.fps,
          settings.quality,
          settings.scope,
          settings.selectedClipIds,
          settings.burnInSubtitles,
          settings.rangeStartSeconds,
          settings.rangeEndSeconds,
        ])
      : null;
  const estimate = useVideoExportSizeEstimate(estimateKey, (signal) => {
    if (!estimateContext) return Promise.reject(new Error('No export source'));
    return estimateProjectExportSize({ ...estimateContext, settings, signal });
  });

  return estimate;
}

/** Advisory result and actions share a fixed footer while settings keep their own scroll area. */
function ExportDialogFooter({
  settings,
  estimate,
  disabled,
  onClose,
  onExport,
}: {
  settings: VideoProjectExportSettings;
  estimate: ReturnType<typeof useExportSizeEstimate>;
  disabled: boolean;
  onClose(): void;
  onExport(): void;
}) {
  return (
    <ProductModalFooter compact className="shrink-0 flex-col !items-stretch gap-3">
      <VideoExportSizeHint status={estimate.status} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.exportDialog.outputSizeLabel')}: {settings.width} ×{' '}
          {settings.height}
        </span>
        <ExportDialogActions
          disabled={disabled}
          onClose={() => {
            estimate.cancel();
            onClose();
          }}
          onExport={() => {
            estimate.cancel();
            onExport();
          }}
        />
      </div>
    </ProductModalFooter>
  );
}
