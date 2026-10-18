import { InspectorLayout } from '../compact-inspector-controls/layout';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HighlighterPresetPropertyField } from './inspector-field';

it('renders a neutral shared preset field with its accessible label metadata', () => {
  const markup = renderToStaticMarkup(
    <HighlighterPresetPropertyField compactLabel label="Diameter">
      <input aria-label="Diameter" />
    </HighlighterPresetPropertyField>
  );
  expect(markup).toContain('shared.highlighter-preset-editor.property-field');
  expect(markup).toContain('data-field-label="Diameter"');
  expect(markup).toContain('grid-cols-[4rem_minmax(0,1fr)]');
});

it('uses canonical parameter construction only in a migrated inspector', () => {
  const markup = renderToStaticMarkup(
    <InspectorLayout>
      <HighlighterPresetPropertyField compactLabel label="Diameter">
        <input aria-label="Diameter" maxLength={64} />
      </HighlighterPresetPropertyField>
    </InspectorLayout>
  );
  expect(markup).toContain('sniptale-parameter-row');
  expect(markup).toContain('sniptale-parameter-name');
  expect(markup).toContain('shared.highlighter-preset-editor.property-field');
  expect(markup).toContain('aria-label="Diameter"');
  expect(markup).toMatch(/maxlength="64"/i);
  expect(markup).not.toContain('grid-cols-[4rem_minmax(0,1fr)]');
  expect(markup).not.toContain('text-[11px]');
});
