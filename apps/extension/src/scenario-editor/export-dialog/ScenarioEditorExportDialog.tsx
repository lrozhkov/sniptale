import { useState } from 'react';
import { translate } from '../../platform/i18n';
import type { ScenarioExportImageFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioProject } from '../../features/scenario/contracts/types/project';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductField, ProductToggle } from '@sniptale/ui/product-form-controls';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';

type ExportFormat = 'html' | 'markdown';

function canIncludeFullImages(imageFormat: ScenarioExportImageFormat): boolean {
  return imageFormat === 'png';
}

const SCENARIO_EXPORT_SELECTED_BUTTON_CLASS = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-accent-strong)_46%,',
  'var(--sniptale-color-border-soft)_54%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_10%,var(--sniptale-color-surface-panel)_90%)]',
].join(' ');

const SCENARIO_EXPORT_IDLE_BUTTON_CLASS = [
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]',
  [
    'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,',
    'var(--sniptale-color-border-accent-strong)_24%)]',
  ].join(''),
].join(' ');

function ScenarioExportDialogHeader(props: { projectName: string }) {
  return (
    <div>
      <div>
        <h2 className="text-xl font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('scenario.editor.exportAction')}
        </h2>
        <p className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">{props.projectName}</p>
      </div>
    </div>
  );
}

function getScenarioExportSegmentedButtonClass(selected: boolean): string {
  return [
    'rounded-full border px-4 py-2 text-sm font-medium transition',
    selected ? SCENARIO_EXPORT_SELECTED_BUTTON_CLASS : SCENARIO_EXPORT_IDLE_BUTTON_CLASS,
  ].join(' ');
}

function ScenarioExportFutureFormatButton(props: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="rounded-full border border-[var(--sniptale-color-border-soft)] px-4 py-2 text-sm opacity-60"
    >
      {props.label}
    </button>
  );
}

function ScenarioExportFormatButtons(props: {
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {(['html', 'markdown'] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => props.onFormatChange(value)}
          data-selected={props.format === value ? 'true' : undefined}
          className={getScenarioExportSegmentedButtonClass(props.format === value)}
        >
          {value === 'html'
            ? translate('scenario.editor.exportHtml')
            : translate('scenario.editor.exportMarkdown')}
        </button>
      ))}
      <ScenarioExportFutureFormatButton label="PDF" />
      <ScenarioExportFutureFormatButton label="DOCX" />
    </div>
  );
}

function ScenarioExportImageFormatButtons(props: {
  imageFormat: ScenarioExportImageFormat;
  onImageFormatChange: (format: ScenarioExportImageFormat) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-[var(--sniptale-color-text-secondary)]">
        {translate('scenario.editor.exportImageFormat')}
      </span>
      {(['svg', 'png'] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => props.onImageFormatChange(value)}
          data-selected={props.imageFormat === value ? 'true' : undefined}
          className={getScenarioExportSegmentedButtonClass(props.imageFormat === value)}
        >
          {value === 'svg'
            ? translate('scenario.editor.exportImageSvg')
            : translate('scenario.editor.exportImagePng')}
        </button>
      ))}
    </div>
  );
}

function ScenarioExportDialogActions(props: {
  format: ExportFormat;
  includeFullImages: boolean;
  imageFormat: ScenarioExportImageFormat;
  onExport: (
    format: ExportFormat,
    mode: 'download' | 'copy',
    imageFormat: ScenarioExportImageFormat,
    includeFullImages: boolean
  ) => Promise<void>;
}) {
  const includeFullImages = props.includeFullImages && canIncludeFullImages(props.imageFormat);

  return (
    <div className="flex items-center justify-end gap-2">
      {props.format === 'html' ? (
        <ProductActionButton
          tone="secondary"
          onClick={() => void props.onExport('html', 'copy', props.imageFormat, includeFullImages)}
        >
          {translate('scenario.editor.copyHtml')}
        </ProductActionButton>
      ) : null}
      <ProductActionButton
        tone="primary"
        onClick={() => {
          void props.onExport(props.format, 'download', props.imageFormat, includeFullImages);
        }}
      >
        {translate('scenario.editor.exportAction')}
      </ProductActionButton>
    </div>
  );
}

function ScenarioExportDialogControls(props: {
  format: ExportFormat;
  includeFullImages: boolean;
  imageFormat: ScenarioExportImageFormat;
  onFormatChange: (format: ExportFormat) => void;
  onIncludeFullImagesChange: (value: boolean) => void;
  onImageFormatChange: (format: ScenarioExportImageFormat) => void;
}) {
  const includeFullImagesEnabled = canIncludeFullImages(props.imageFormat);

  return (
    <div
      className="grid gap-3 rounded-[20px] border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)] p-4"
    >
      <ScenarioExportFormatButtons format={props.format} onFormatChange={props.onFormatChange} />
      <ScenarioExportImageFormatButtons
        imageFormat={props.imageFormat}
        onImageFormatChange={props.onImageFormatChange}
      />
      {props.format === 'html' ? (
        <div
          className="flex items-center justify-between gap-4 rounded-[18px] border
            border-[var(--sniptale-color-border-soft)] px-4 py-3"
        >
          <ProductField
            label={translate('scenario.editor.exportIncludeFullImages')}
            hint={translate(
              includeFullImagesEnabled
                ? 'scenario.editor.exportIncludeFullImagesHint'
                : 'scenario.editor.exportIncludeFullImagesSvgHint'
            )}
          >
            <span className="sr-only">{translate('scenario.editor.exportIncludeFullImages')}</span>
          </ProductField>
          <ProductToggle
            checked={includeFullImagesEnabled && props.includeFullImages}
            disabled={!includeFullImagesEnabled}
            onClick={() =>
              props.onIncludeFullImagesChange(
                includeFullImagesEnabled ? !props.includeFullImages : false
              )
            }
            aria-label={translate('scenario.editor.exportIncludeFullImages')}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ScenarioEditorExportDialog(props: {
  onClose: () => void;
  onExport: (
    format: ExportFormat,
    mode: 'download' | 'copy',
    imageFormat: ScenarioExportImageFormat,
    includeFullImages: boolean
  ) => Promise<void>;
  project: ScenarioProject;
}) {
  const dialogState = useScenarioExportDialogState();

  return (
    <ProductModal
      onClose={props.onClose}
      closeOnBackdrop
      width="min(1080px, calc(100vw - 48px))"
      maxHeight="88vh"
      scrollable
    >
      <ProductModalHeader
        title={<ScenarioExportDialogHeader projectName={props.project.name} />}
        onClose={props.onClose}
      />
      <ProductModalBody className="gap-4">
        <ScenarioExportDialogControls
          format={dialogState.format}
          includeFullImages={dialogState.includeFullImages}
          imageFormat={dialogState.imageFormat}
          onFormatChange={dialogState.setFormat}
          onIncludeFullImagesChange={dialogState.setIncludeFullImages}
          onImageFormatChange={dialogState.handleImageFormatChange}
        />
      </ProductModalBody>
      <ProductModalFooter>
        <ScenarioExportDialogActions
          format={dialogState.format}
          includeFullImages={dialogState.includeFullImages}
          imageFormat={dialogState.imageFormat}
          onExport={props.onExport}
        />
      </ProductModalFooter>
    </ProductModal>
  );
}

function useScenarioExportDialogState() {
  const [format, setFormat] = useState<ExportFormat>('html');
  const [imageFormat, setImageFormat] = useState<ScenarioExportImageFormat>('png');
  const [includeFullImages, setIncludeFullImages] = useState(false);
  const handleImageFormatChange = (nextFormat: ScenarioExportImageFormat) => {
    setImageFormat(nextFormat);
    if (!canIncludeFullImages(nextFormat)) {
      setIncludeFullImages(false);
    }
  };

  return {
    format,
    handleImageFormatChange,
    imageFormat,
    includeFullImages,
    setFormat,
    setIncludeFullImages,
  };
}
