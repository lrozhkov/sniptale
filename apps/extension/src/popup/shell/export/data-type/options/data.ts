import type { ComponentType } from 'react';
import {
  Camera,
  Code2,
  FileText,
  Globe,
  Images,
  NotebookText,
  Paperclip,
  SwatchBook,
} from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import type {
  PopupExportPreferenceActions,
  PopupExportPreferenceValues,
} from '../../session/types';

export type ExportOptionKey =
  | 'json'
  | 'markdown'
  | 'files'
  | 'images'
  | 'basicLogs'
  | 'harDomLogs'
  | 'cssDiagnostics'
  | 'fullPageScreenshot';

export type ExportOptionToggleProps = PopupExportPreferenceActions &
  PopupExportPreferenceValues & {
    disabled: boolean;
  };

export type ExportOptionConfig = {
  accentClassName: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  key: ExportOptionKey;
  label: string;
};

export function getExportOptionConfigs(): ExportOptionConfig[] {
  return [...getContentOptionConfigs(), ...getDiagnosticsOptionConfigs()];
}

export function getContentOptionConfigs(): ExportOptionConfig[] {
  return [
    {
      accentClassName: 'text-[var(--sniptale-color-accent)]',
      description: translate('popup.export.includeJsonDescription'),
      icon: Code2,
      key: 'json',
      label: translate('popup.export.includeJsonLabel'),
    },
    {
      accentClassName: 'text-[var(--sniptale-color-accent)]',
      description: translate('popup.export.includeMarkdownDescription'),
      icon: FileText,
      key: 'markdown',
      label: translate('popup.export.includeMarkdownLabel'),
    },
    {
      accentClassName: 'text-[var(--sniptale-color-accent)]',
      description: translate('popup.export.includeFilesDescription'),
      icon: Paperclip,
      key: 'files',
      label: translate('popup.export.includeFilesLabel'),
    },
    {
      accentClassName: 'text-[var(--sniptale-color-accent)]',
      description: translate('popup.export.includeImagesDescription'),
      icon: Images,
      key: 'images',
      label: translate('popup.export.includeImagesLabel'),
    },
  ];
}

export function getDiagnosticsOptionConfigs(): ExportOptionConfig[] {
  return [
    {
      accentClassName: 'text-[var(--sniptale-color-accent)]',
      description: translate('popup.export.includeBasicLogsDescription'),
      icon: NotebookText,
      key: 'basicLogs',
      label: translate('popup.export.includeBasicLogsLabel'),
    },
    {
      accentClassName: 'text-[var(--sniptale-color-accent)]',
      description: translate('popup.export.includeHarDomLogsDescription'),
      icon: Globe,
      key: 'harDomLogs',
      label: translate('popup.export.includeHarDomLogsLabel'),
    },
    {
      accentClassName: 'text-[var(--sniptale-color-accent)]',
      description: translate('popup.export.includeCssDiagnosticsDescription'),
      icon: SwatchBook,
      key: 'cssDiagnostics',
      label: translate('popup.export.includeCssDiagnosticsLabel'),
    },
    {
      accentClassName: 'text-[var(--sniptale-color-accent)]',
      description: translate('popup.export.includeFullPageScreenshotDescription'),
      icon: Camera,
      key: 'fullPageScreenshot',
      label: translate('popup.export.includeFullPageScreenshotLabel'),
    },
  ];
}

export function getExportOptionActive(key: ExportOptionKey, props: ExportOptionToggleProps) {
  switch (key) {
    case 'json':
      return props.includeJson;
    case 'markdown':
      return props.includeMarkdown;
    case 'files':
      return props.includeFiles;
    case 'images':
      return props.includeImages;
    case 'basicLogs':
      return props.includeBasicLogs;
    case 'cssDiagnostics':
      return props.includeCssDiagnostics;
    case 'harDomLogs':
      return props.includeHarDomLogs;
    case 'fullPageScreenshot':
      return props.includeFullPageScreenshot;
  }
}

export function toggleExportOption(key: ExportOptionKey, props: ExportOptionToggleProps) {
  switch (key) {
    case 'json':
      props.setIncludeJson((value) => !value);
      return;
    case 'markdown':
      props.setIncludeMarkdown((value) => !value);
      return;
    case 'files':
      props.setIncludeFiles((value) => !value);
      return;
    case 'images':
      props.setIncludeImages((value) => !value);
      return;
    case 'basicLogs':
      props.setIncludeBasicLogs((value) => !value);
      return;
    case 'cssDiagnostics':
      props.setIncludeCssDiagnostics((value) => !value);
      return;
    case 'harDomLogs':
      props.setIncludeHarDomLogs((value) => !value);
      return;
    case 'fullPageScreenshot':
      props.setIncludeFullPageScreenshot((value) => !value);
  }
}

export function setExportOptionActive(
  key: ExportOptionKey,
  nextValue: boolean,
  props: ExportOptionToggleProps
) {
  switch (key) {
    case 'json':
      props.setIncludeJson(nextValue);
      return;
    case 'markdown':
      props.setIncludeMarkdown(nextValue);
      return;
    case 'files':
      props.setIncludeFiles(nextValue);
      return;
    case 'images':
      props.setIncludeImages(nextValue);
      return;
    case 'basicLogs':
      props.setIncludeBasicLogs(nextValue);
      return;
    case 'cssDiagnostics':
      props.setIncludeCssDiagnostics(nextValue);
      return;
    case 'harDomLogs':
      props.setIncludeHarDomLogs(nextValue);
      return;
    case 'fullPageScreenshot':
      props.setIncludeFullPageScreenshot(nextValue);
  }
}

export function getExportOptionDisabled(_key: ExportOptionKey, props: ExportOptionToggleProps) {
  return props.disabled;
}
