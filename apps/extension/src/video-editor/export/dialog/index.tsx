import React from 'react';
import { Download, FileOutput } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { getAvailableMp4VideoCodecs } from '../../../features/video/project/export/capabilities';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { OptionRow, PanelSection } from '../../../ui/compact-inspector-controls';
import {
  VideoExportFormat,
  VideoSubtitleSidecarFormat,
} from '../../../features/video/project/types';
import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { useExportDialogCapabilities } from './capability-state';
import { ExportDialogFields } from './fields';

interface ExportDialogProps {
  selectedClipAvailable?: boolean;
  settings: VideoProjectExportSettings;
  onClose: () => void;
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
  onExport: () => void;
}

function ExportDialogHeader({ formatLabel }: { formatLabel: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sniptale-color-text-muted)]">
        {translate('videoEditor.exportDialog.eyebrow')}
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('videoEditor.exportDialog.titlePrefix')} {formatLabel}
      </h2>
      <p className="mt-2 text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('videoEditor.exportDialog.description')}
      </p>
    </div>
  );
}

function ExportDialogHintCard(props: {
  capabilities: VideoExportCapabilities | null;
  capabilityError: string | null;
  capabilitiesPending: boolean;
  settings: VideoProjectExportSettings;
}) {
  const { capabilities, capabilityError, capabilitiesPending, settings } = props;
  const availableMp4Codecs = capabilities ? getAvailableMp4VideoCodecs(capabilities) : [];
  const hintMessage = capabilitiesPending
    ? translate('videoEditor.exportDialog.capabilityLoading')
    : settings.format === VideoExportFormat.MP4
      ? availableMp4Codecs.length > 1
        ? translate('videoEditor.exportDialog.mp4HintSelectable')
        : translate('videoEditor.exportDialog.mp4HintSingleCodec')
      : translate('videoEditor.exportDialog.webmHint');

  return (
    <PanelSection label={hintMessage}>
      {capabilityError ? (
        <p className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.exportDialog.capabilityFallbackNote')} {capabilityError}
        </p>
      ) : null}
    </PanelSection>
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
          className="inline-flex min-w-0 items-center gap-2 text-[12px] font-semibold
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
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
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

function ExportDialogSubtitleToggle({
  settings,
  onChange,
}: {
  settings: VideoProjectExportSettings;
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
}) {
  const enabled = (settings.subtitleSidecarFormats?.length ?? 0) > 0;

  return (
    <ExportDialogBooleanToggle
      checked={enabled}
      icon={<FileOutput size={16} strokeWidth={2} />}
      label={translate('videoEditor.exportDialog.exportSubtitleFiles')}
      onClick={() =>
        onChange({
          subtitleSidecarFormats: enabled
            ? []
            : [VideoSubtitleSidecarFormat.SRT, VideoSubtitleSidecarFormat.VTT],
        })
      }
    />
  );
}

function ExportDialogBurnInToggle({
  settings,
  onChange,
}: {
  settings: VideoProjectExportSettings;
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
}) {
  return (
    <ExportDialogBooleanToggle
      checked={settings.burnInSubtitles === true}
      icon={<FileOutput size={16} strokeWidth={2} />}
      label={translate('videoEditor.exportDialog.burnInSubtitles')}
      onClick={() => onChange({ burnInSubtitles: !settings.burnInSubtitles })}
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
  selectedClipAvailable = false,
  settings,
  onClose,
  onChange,
  onExport,
}) => {
  const { capabilities, capabilitiesPending, capabilityError } = useExportDialogCapabilities({
    onChange,
    settings,
  });

  const formatLabel =
    settings.format === VideoExportFormat.MP4
      ? translate('videoEditor.exportDialog.formatMp4Label')
      : translate('videoEditor.exportDialog.formatWebmLabel');
  const canExport =
    !capabilitiesPending &&
    (settings.format !== VideoExportFormat.MP4 || settings.mp4VideoCodec !== undefined);

  return (
    <ProductModal onClose={onClose} closeOnBackdrop width="min(880px, calc(100vw - 32px))">
      <ProductModalHeader
        title={<ExportDialogHeader formatLabel={formatLabel} />}
        onClose={onClose}
      />
      <ProductModalBody className="gap-4">
        <ExportDialogFields
          capabilities={capabilities}
          settings={settings}
          onChange={onChange}
          selectedClipAvailable={selectedClipAvailable}
        />
        <ExportDialogHintCard
          capabilities={capabilities}
          capabilitiesPending={capabilitiesPending}
          capabilityError={capabilityError}
          settings={settings}
        />
        <ExportDialogBurnInToggle settings={settings} onChange={onChange} />
        <ExportDialogSubtitleToggle settings={settings} onChange={onChange} />
        <ExportDialogDownloadToggle settings={settings} onChange={onChange} />
      </ProductModalBody>
      <ProductModalFooter>
        <ExportDialogActions disabled={!canExport} onClose={onClose} onExport={onExport} />
      </ProductModalFooter>
    </ProductModal>
  );
};
