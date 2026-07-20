import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: (key: string) => key,
  };
});

import { DiagnosticsPanelHeader } from './header';

describe('diagnostics-panel/header', () => {
  it('renders export and close actions with the shared borderless CTA language', () => {
    const markup = renderToStaticMarkup(
      <DiagnosticsPanelHeader
        eventsCount={3}
        isExporting={false}
        onExportJSON={() => undefined}
        onExportZIP={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(markup).toContain('data-ui="video-editor.diagnostics.export-json"');
    expect(markup).toContain('data-ui="video-editor.diagnostics.export-zip"');
    expect(markup).toContain('data-ui="video-editor.diagnostics.close"');
    expect(markup).toContain('inline-flex h-10 min-h-10');
    expect(markup).toContain('inline-flex h-9 w-9');
    expect(markup).toContain('videoEditor.diagnostics.title');
    expect(markup).toContain('videoEditor.diagnostics.eventsSuffix');
    expect(markup).toContain('video-editor.diagnostics.export-disclosure');
    expect(markup).toContain('videoEditor.diagnostics.exportDisclosure');
  });
});
