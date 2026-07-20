import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { DiagnosticsPanelStatsBar } from './stats-bar';

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: (key: string) => key,
  };
});

it('renders diagnostics filters through shared toggle action buttons', () => {
  const markup = renderToStaticMarkup(
    <DiagnosticsPanelStatsBar
      filter="warn"
      setFilter={() => undefined}
      stats={{
        actions: 0,
        console: 4,
        errors: 2,
        network: 3,
        total: 10,
        warns: 1,
      }}
    />
  );

  expect(markup).toContain('data-ui="video-editor.diagnostics.filter"');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('inline-flex h-10 min-h-10');
  expect(markup).toContain('videoEditor.diagnostics.filterWarnings');
  expect(markup).toContain('videoEditor.diagnostics.filterConsole');
});
