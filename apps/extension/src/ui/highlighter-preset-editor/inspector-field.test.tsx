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
