import type {
  ScenarioDeckExportFormat,
  ScenarioDeckExportOptions,
} from '../../project/export/deck/types';

export function createInitialScenarioDeckExportOptions(): ScenarioDeckExportOptions {
  return {
    assetMode: 'embed',
    format: 'html',
    includeMissingPlaceholders: true,
    includeNotes: true,
    includeSourceJson: false,
  };
}

export function resolveScenarioDeckExportOptions(
  options: ScenarioDeckExportOptions
): ScenarioDeckExportOptions {
  if (options.format === 'markdown') {
    return { ...options, assetMode: 'files' };
  }

  return options;
}

export function setScenarioDeckExportFormat(
  options: ScenarioDeckExportOptions,
  format: ScenarioDeckExportFormat
): ScenarioDeckExportOptions {
  return resolveScenarioDeckExportOptions({ ...options, format });
}
