import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';
import { useVideoExportSizeEstimate } from '../../../ui/video-export/use-size-estimate';
import { VideoExportSizeHint } from '../../../ui/video-export/size-estimate';
import { estimateProjectExportSize } from '../estimate-size';
import type { VideoProject } from '../../../features/video/project/types';
import React, { useEffect, useRef } from 'react';
import { Download, FileOutput } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
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

interface ExportSettingsPanelProps {
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
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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

/** Export settings share the workspace inspector without a modal input boundary. */
export const ExportSettingsPanel: React.FC<ExportSettingsPanelProps> = ({
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
  useExportInspectorFocus(rootRef);
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
    <div
      ref={rootRef}
      role="region"
      aria-label={translate('videoEditor.exportDialog.title')}
      tabIndex={-1}
      data-ui="video-editor.export.inspector"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-3 overflow-y-auto p-3">
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
      </div>
      <ExportDialogFooter
        settings={settings}
        estimate={estimate}
        disabled={!canExport}
        onClose={onClose}
        onExport={onExport}
      />
    </div>
  );
};

/** The cache identity includes only content and settings that change encoded bytes. */
function useExportSizeEstimate(
  estimateContext: ExportSettingsPanelProps['estimateContext'],
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
    <div className="flex shrink-0 flex-col gap-3 border-t border-[var(--sniptale-color-border-soft)] px-3 py-2">
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
    </div>
  );
}

/** Inspector focus enters once and restores only while the closing panel still owns it. */
function useExportInspectorFocus(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const opener = document.activeElement;
    root.focus();
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const layers = getOwnedFloatingInteractionLayers(root, document);
      const layer = layers.find((item) => item.contains(document.activeElement));
      if (!layer) return;
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'
        ),
      ].filter(
        (item) =>
          !item.closest('[hidden], [inert]') &&
          item.getAttribute('type') !== 'hidden' &&
          !layers.some((popup) => popup.contains(item))
      );
      const ownerIndex = controls.findIndex(
        (item) => item.getAttribute('aria-controls') === layer.id
      );
      if (ownerIndex < 0) return;
      const next = controls[ownerIndex + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      if (!root.contains(document.activeElement) && document.activeElement !== document.body)
        return;
      const target =
        opener instanceof HTMLElement && opener.isConnected
          ? opener
          : document.querySelector<HTMLElement>(
              '[data-ui="video-editor.timeline.toolbar.project-menu"]'
            );
      target?.focus();
    };
  }, [rootRef]);
}
