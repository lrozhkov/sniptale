import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../ui/compact-inspector-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/compact-inspector-controls')>()),
  CompactColorOption: (props: Record<string, unknown>) => <button {...props} />,
}));

vi.mock('../ui/primitives', async (importOriginal) => ({
  ...(await importOriginal()),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { buildColorOptions, ColorSection } from './shared';

it('builds bounded unique editor color options', () => {
  expect(buildColorOptions('#111111', ['#222222', '#111111'], ['#333333', '#444444'])).toEqual([
    '#111111',
    '#222222',
    '#333333',
    '#444444',
  ]);
});

it('renders swatch sections only when colors exist', () => {
  expect(
    renderToStaticMarkup(
      <ColorSection
        colors={['#111111']}
        label="Recent"
        selectedColor="#111111"
        title="Color"
        onSelect={vi.fn()}
      />
    )
  ).toContain('Color: #111111');
  expect(
    renderToStaticMarkup(
      <ColorSection
        colors={['#111111']}
        label="Recent"
        selectedColor="#111111"
        title="Color"
        onSelect={vi.fn()}
      />
    )
  ).toContain('grid-cols-10');
  expect(
    renderToStaticMarkup(
      <ColorSection
        colors={[]}
        label="Recent"
        selectedColor="#111111"
        title="Color"
        onSelect={vi.fn()}
      />
    )
  ).toBe('');
});
