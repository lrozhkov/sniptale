import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { ColorSelectorSwatchSection } from './swatch-section';

it('renders color swatches with active state and optional layout classes', () => {
  const markup = renderToStaticMarkup(
    <ColorSelectorSwatchSection
      colors={['#111111', '#222222']}
      label="Recent"
      selectedColor="#222222"
      title="Color"
      onSelect={() => undefined}
      gridClassName="custom-grid"
      optionClassName="custom-option"
    />
  );

  expect(markup).toContain('Recent');
  expect(markup).toContain('Color: #222222');
  expect(markup).toContain('custom-grid');
  expect(markup).toContain('custom-option');
});

it('omits empty swatch sections', () => {
  expect(
    renderToStaticMarkup(
      <ColorSelectorSwatchSection
        colors={[]}
        label="Recent"
        selectedColor="#222222"
        title="Color"
        onSelect={() => undefined}
      />
    )
  ).toBe('');
});
