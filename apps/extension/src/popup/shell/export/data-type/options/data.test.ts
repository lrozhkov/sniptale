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
    includeAnnotations: false,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
    includeWebCopy: false,
    setIncludeAnnotations: vi.fn(),
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludePageDiagnostics: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
    setIncludeWebCopy: vi.fn(),
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
      includePageDiagnostics: true,
      includeImages: false,
      includeMarkdown: true,
    });

    expect(getExportOptionActive('basicLogs', props)).toBe(true);
    expect(getExportOptionActive('cssDiagnostics', props)).toBe(true);
    expect(getExportOptionActive('files', props)).toBe(false);
    expect(getExportOptionActive('fullPageScreenshot', props)).toBe(true);
    expect(getExportOptionActive('pageDiagnostics', props)).toBe(true);
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
      'webCopy',
      'annotations',
      'json',
      'markdown',
      'files',
      'images',
      'basicLogs',
      'pageDiagnostics',
      'cssDiagnostics',
      'fullPageScreenshot',
    ]);
  });

  it('describes page analysis data without browser-internal terminology', () => {
    const pageDiagnostics = getDiagnosticsOptionConfigs().find(
      (option) => option.key === 'pageDiagnostics'
    );

    expect(pageDiagnostics?.label).toBe('Расширенные данные страницы');
    expect(pageDiagnostics?.description.toLowerCase()).toContain('видимый текст');
    expect(pageDiagnostics?.description).toContain('исходные ссылки');
    expect(pageDiagnostics?.description).not.toContain('DOM');
    expect(pageDiagnostics?.description).not.toContain('Resource Timing');
  });
});

describe('popup export option toggles', () => {
  it('routes toggles to the matching setter', () => {
    const props = createProps();

    toggleExportOption('basicLogs', props);
    toggleExportOption('annotations', props);
    toggleExportOption('cssDiagnostics', props);
    toggleExportOption('files', props);
    toggleExportOption('markdown', props);
    toggleExportOption('json', props);
    toggleExportOption('images', props);
    toggleExportOption('pageDiagnostics', props);
    toggleExportOption('fullPageScreenshot', props);

    expect(props.setIncludeBasicLogs).toHaveBeenCalledTimes(1);
    expect(props.setIncludeAnnotations).toHaveBeenCalledTimes(1);
    expect(props.setIncludeCssDiagnostics).toHaveBeenCalledTimes(1);
    expect(props.setIncludeFiles).toHaveBeenCalledTimes(1);
    expect(props.setIncludeMarkdown).toHaveBeenCalledTimes(1);
    expect(props.setIncludeJson).toHaveBeenCalledTimes(1);
    expect(props.setIncludeImages).toHaveBeenCalledTimes(1);
    expect(props.setIncludePageDiagnostics).toHaveBeenCalledTimes(1);
    expect(props.setIncludeFullPageScreenshot).toHaveBeenCalledTimes(1);
  });

  it('sets explicit export option values for bulk selection flows', () => {
    const props = createProps();

    setExportOptionActive('basicLogs', true, props);
    setExportOptionActive('annotations', true, props);
    setExportOptionActive('json', false, props);
    setExportOptionActive('images', true, props);
    setExportOptionActive('fullPageScreenshot', true, props);

    expect(props.setIncludeBasicLogs).toHaveBeenCalledWith(true);
    expect(props.setIncludeAnnotations).toHaveBeenCalledWith(true);
    expect(props.setIncludeJson).toHaveBeenCalledWith(false);
    expect(props.setIncludeImages).toHaveBeenCalledWith(true);
    expect(props.setIncludeFullPageScreenshot).toHaveBeenCalledWith(true);
  });

  it('routes diagnostics toggles through the shared popup preference setter seam', () => {
    const props = createProps();

    setExportOptionActive('pageDiagnostics', true, props);
    setExportOptionActive('cssDiagnostics', false, props);

    expect(props.setIncludePageDiagnostics).toHaveBeenCalledWith(true);
    expect(props.setIncludeCssDiagnostics).toHaveBeenCalledWith(false);
  });
});
