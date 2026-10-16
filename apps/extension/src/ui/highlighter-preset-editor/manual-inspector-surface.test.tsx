import { InspectorLayout } from '../compact-inspector-controls/layout';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HighlighterManualInspectorSurface } from './manual-inspector-surface';

it('provides the shared outline around categorized manual settings', () => {
  const markup = renderToStaticMarkup(
    <HighlighterManualInspectorSurface>
      <span>Inspector</span>
    </HighlighterManualInspectorSurface>
  );

  expect(markup).toContain('shared.highlighter-manual-inspector-surface');
  expect(markup).toContain('rounded-[12px]');
  expect(markup).toContain('border-solid');
  expect(markup).toContain('border-[var(--sniptale-color-border-soft)]');
});

it('adopts the compact outline only for a migrated inspector', () => {
  const markup = renderToStaticMarkup(
    <InspectorLayout>
      <HighlighterManualInspectorSurface>
        <span>Inspector</span>
      </HighlighterManualInspectorSurface>
    </InspectorLayout>
  );
  expect(markup).toContain('shared.highlighter-manual-inspector-surface');
  expect(markup).toContain('rounded-[4px]');
  expect(markup).not.toContain('rounded-[12px]');
  expect(markup).toContain('<span>Inspector</span>');
});
