import { describe, expect, it, vi } from 'vitest';

vi.mock('./layout', () => ({
  ExportFooterLayout: (props: Record<string, unknown>) => (
    <footer data-testid="footer-layout">{JSON.stringify(props)}</footer>
  ),
}));

import { ExportFooterActions } from './actions';

function renderActions(overrides: Partial<Parameters<typeof ExportFooterActions>[0]> = {}) {
  return ExportFooterActions({
    canCopyJson: true,
    canCopyMarkdown: true,
    canExport: true,
    copyJsonTitle: 'Copy JSON current tab',
    copyMarkdownTitle: 'Copy Markdown current tab',
    copiedFormat: null,
    disabledTitle: null,
    isExporting: false,
    isResultReady: false,
    onCancelExport: vi.fn(),
    onCopyJson: vi.fn(),
    onCopyMarkdown: vi.fn(),
    onResetExportView: vi.fn(),
    onStartExport: vi.fn(),
    ...overrides,
  });
}

describe('ExportFooterActions', () => {
  it('derives the export title before composing the footer layout', () => {
    const element = renderActions({ disabledTitle: 'Недоступно', isExporting: true });

    expect(element.props.exportTitle).toBe('Недоступно');
    expect(element.props.copyJsonTitle).toBe('Copy JSON current tab');
    expect(element.props.copyMarkdownTitle).toBe('Copy Markdown current tab');
    expect(element.props.isResultReady).toBe(false);
  });

  it('passes web snapshot result action props through to the footer layout', () => {
    const onOpenLibraryResult = vi.fn();
    const element = renderActions({
      onOpenLibraryResult,
      openLibraryResultTitle: 'Open in Library',
    });

    expect(element.props.onOpenLibraryResult).toBe(onOpenLibraryResult);
    expect(element.props.openLibraryResultTitle).toBe('Open in Library');
  });

  it('uses the default export title when no disabled title is provided', () => {
    const element = renderActions({ disabledTitle: null });

    expect(element.props.exportTitle).toBe('Экспортировать');
  });
});
