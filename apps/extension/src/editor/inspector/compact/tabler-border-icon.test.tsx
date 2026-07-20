import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const tablerIconMock = vi.hoisted(() => vi.fn());

vi.mock('./tabler-icon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tabler-icon')>()),
  TablerIcon: (props: unknown) => {
    tablerIconMock(props);
    return <span data-ui="tabler-border-glyph" />;
  },
}));

import { TablerBorderIcon } from './tabler-border-icon';

function renderBorderIcon(props: Parameters<typeof TablerBorderIcon>[0]) {
  return renderToStaticMarkup(<TablerBorderIcon {...props} />);
}

function latestTablerIconProps() {
  return tablerIconMock.mock.lastCall?.[0] as
    | { color?: string; opacity?: number; size?: number; style?: { strokeDasharray?: string } }
    | undefined;
}

beforeEach(() => {
  tablerIconMock.mockClear();
});

it('maps every supported border style to its icon dash pattern', () => {
  const patterns = [
    ['dot', '1 4'],
    ['dash', '4 3'],
    ['dash-dot', '5 3 1 3'],
    ['long-dash', '7 3'],
  ] as const;

  for (const [strokeStyle, expectedPattern] of patterns) {
    renderBorderIcon({ color: '#2563eb', strokeStyle });
    expect(latestTablerIconProps()?.style?.strokeDasharray).toBe(expectedPattern);
  }
  renderBorderIcon({ color: '#2563eb', strokeStyle: 'solid' });
  expect(latestTablerIconProps()?.style?.strokeDasharray).toBeUndefined();
});

it('shows the transparent-border marker for every invisible border form', () => {
  const invisibleBorders = [
    {},
    { color: '#2563eb', opacity: 0 },
    { color: '#2563eb', strokeWidth: 0 },
    { color: 'transparent' },
    { color: '#0000' },
    { color: '#00000000' },
  ];

  for (const props of invisibleBorders) {
    const markup = renderBorderIcon(props);
    expect(markup.match(/rounded-full/gu)).toHaveLength(5);
    expect(latestTablerIconProps()?.opacity).toBe(0);
  }
});

it('forwards visible color, opacity, and size without transparent markers', () => {
  const markup = renderBorderIcon({ color: '#2563eb', opacity: 0.45, size: 20 });

  expect(latestTablerIconProps()).toMatchObject({ color: '#2563eb', opacity: 0.45, size: 20 });
  expect(markup).toContain('data-ui="tabler-border-glyph"');
  expect(markup).not.toContain('rounded-full');
});
