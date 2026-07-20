import { describe, expect, it, vi } from 'vitest';
import {
  getExportOptionActive,
  getExportOptionConfigs,
  getExportOptionDisabled,
  getDiagnosticsOptionConfigs,
  setExportOptionActive,
  toggleExportOption,
  type ExportOptionToggleProps,
} from './data';

function createProps(overrides: Partial<ExportOptionToggleProps> = {}): ExportOptionToggleProps {
  return {
    disabled: false,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludeHarDomLogs: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
    ...overrides,
  };
}

describe('popup export option state lookup', () => {
  it('reads active state from the matching toggle flag', () => {
    const props = createProps({
      includeBasicLogs: true,
      includeCssDiagnostics: true,
      includeFiles: false,
      includeFullPageScreenshot: true,
      includeHarDomLogs: true,
      includeImages: false,
      includeMarkdown: true,
    });

    expect(getExportOptionActive('basicLogs', props)).toBe(true);
    expect(getExportOptionActive('cssDiagnostics', props)).toBe(true);
    expect(getExportOptionActive('files', props)).toBe(false);
    expect(getExportOptionActive('fullPageScreenshot', props)).toBe(true);
    expect(getExportOptionActive('harDomLogs', props)).toBe(true);
    expect(getExportOptionActive('markdown', props)).toBe(true);
    expect(getExportOptionActive('json', props)).toBe(true);
    expect(getExportOptionActive('images', props)).toBe(false);
  });
});

describe('popup export option metadata', () => {
  it('respects the global disabled state without coupling images to files', () => {
    expect(getExportOptionDisabled('images', createProps({ includeFiles: false }))).toBe(false);
    expect(getExportOptionDisabled('json', createProps({ disabled: true }))).toBe(true);
  });

  it('returns the full canonical option list for the unified data-type section', () => {
    expect(getExportOptionConfigs().map((option) => option.key)).toEqual([
      'json',
      'markdown',
      'files',
      'images',
      'basicLogs',
      'harDomLogs',
      'cssDiagnostics',
      'fullPageScreenshot',
    ]);
  });

  it('describes detailed logs as a redacted export-time diagnostics option', () => {
    const harDomLogs = getDiagnosticsOptionConfigs().find((option) => option.key === 'harDomLogs');

    expect(harDomLogs?.description).toContain('credentials');
    expect(harDomLogs?.description).toContain('URL');
  });
});

describe('popup export option toggles', () => {
  it('routes toggles to the matching setter', () => {
    const props = createProps();

    toggleExportOption('basicLogs', props);
    toggleExportOption('cssDiagnostics', props);
    toggleExportOption('files', props);
    toggleExportOption('markdown', props);
    toggleExportOption('json', props);
    toggleExportOption('images', props);
    toggleExportOption('harDomLogs', props);
    toggleExportOption('fullPageScreenshot', props);

    expect(props.setIncludeBasicLogs).toHaveBeenCalledTimes(1);
    expect(props.setIncludeCssDiagnostics).toHaveBeenCalledTimes(1);
    expect(props.setIncludeFiles).toHaveBeenCalledTimes(1);
    expect(props.setIncludeMarkdown).toHaveBeenCalledTimes(1);
    expect(props.setIncludeJson).toHaveBeenCalledTimes(1);
    expect(props.setIncludeImages).toHaveBeenCalledTimes(1);
    expect(props.setIncludeHarDomLogs).toHaveBeenCalledTimes(1);
    expect(props.setIncludeFullPageScreenshot).toHaveBeenCalledTimes(1);
  });

  it('sets explicit export option values for bulk selection flows', () => {
    const props = createProps();

    setExportOptionActive('basicLogs', true, props);
    setExportOptionActive('json', false, props);
    setExportOptionActive('images', true, props);
    setExportOptionActive('fullPageScreenshot', true, props);

    expect(props.setIncludeBasicLogs).toHaveBeenCalledWith(true);
    expect(props.setIncludeJson).toHaveBeenCalledWith(false);
    expect(props.setIncludeImages).toHaveBeenCalledWith(true);
    expect(props.setIncludeFullPageScreenshot).toHaveBeenCalledWith(true);
  });

  it('routes diagnostics toggles through the shared popup preference setter seam', () => {
    const props = createProps();

    setExportOptionActive('harDomLogs', true, props);
    setExportOptionActive('cssDiagnostics', false, props);

    expect(props.setIncludeHarDomLogs).toHaveBeenCalledWith(true);
    expect(props.setIncludeCssDiagnostics).toHaveBeenCalledWith(false);
  });
});
