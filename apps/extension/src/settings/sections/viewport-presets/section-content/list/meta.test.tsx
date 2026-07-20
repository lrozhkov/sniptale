// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import type { ViewportPreset } from '../../../../../contracts/settings';
import { PresetRowMeta } from './meta';

const preset: ViewportPreset = {
  id: 'preset-1',
  label: 'Desktop',
  width: 1440,
  height: 900,
};

it('renders the preset label and dimensions', () => {
  const markup = renderToStaticMarkup(<PresetRowMeta preset={preset} />);

  expect(markup).toContain('Desktop');
  expect(markup).toContain('1440 × 900');
  expect(markup).toContain('lucide-monitor');
});
