import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const sectionsMock = vi.hoisted(() => vi.fn(() => <div>grid-sections</div>));

vi.mock('./sections', () => ({ GridPanelSections: sectionsMock }));

import { GridPanelBody } from './disclosure';

it('forwards grid panel props into the canonical sections owner', () => {
  const props = {
    applyGridColor: vi.fn(),
    clampGridSize: (value: number) => value,
    gridColor: '#ccc',
    gridEnabled: true,
    gridPalette: ['#ccc'],
    gridSize: 16,
    gridSizeMax: 64,
    gridSizeMin: 4,
    gridSnapEnabled: false,
    recentColors: ['#111111'],
    toNumber: (value: string) => Number(value),
    updateWorkspace: vi.fn(),
  };

  const markup = renderToStaticMarkup(GridPanelBody(props as never));

  expect(markup).toContain('grid-sections');
  expect(sectionsMock).toHaveBeenCalledWith(expect.objectContaining(props), undefined);
});
