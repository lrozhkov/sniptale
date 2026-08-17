// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createSolidPaint } from '@sniptale/foundation/paint';

const mocks = vi.hoisted(() => ({ picker: vi.fn(), surface: vi.fn() }));
vi.mock('../../paint-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../paint-selector')>()),
  CompactPaintSelector: (props: unknown) => {
    mocks.picker(props);
    return <div data-testid="paint" />;
  },
}));
vi.mock('../../surface-style-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../surface-style-selector')>()),
  SurfaceStyleSelector: (props: unknown) => {
    mocks.surface(props);
    return <div data-testid="surface" />;
  },
}));
vi.mock(
  '../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog',
  () => ({
    useSurfaceStylePresetCatalog: () => ({
      actions: { onCreate: vi.fn() },
      presets: [
        { enabled: true, id: 'surface-1' },
        { enabled: false, id: 'surface-2' },
      ],
    }),
  })
);

import { HighlighterFillPaintField, HighlighterFillSurfaceField } from './fill-paint-field';

it('is the thin Highlighter adapter for the universal Paint selector and palette', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const value = createSolidPaint('#123456');
  const onChange = vi.fn();
  const onOpenChange = vi.fn();
  act(() =>
    root.render(
      <HighlighterFillPaintField
        label="Fill"
        value={value}
        onChange={onChange}
        onOpenChange={onOpenChange}
      />
    )
  );
  expect(mocks.picker).toHaveBeenCalledWith(
    expect.objectContaining({
      value,
      onChange,
      onOpenChange,
      palette: expect.arrayContaining(['#f97316', '#2563eb']),
      recentColors: ['#123456ff'],
    })
  );
  act(() => root.unmount());
  host.remove();
});

it('keeps the floating interaction callback optional outside Content surfaces', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <HighlighterFillPaintField
        label="Fill"
        value={createSolidPaint('#123456')}
        onChange={vi.fn()}
      />
    )
  );
  expect(mocks.picker).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ onOpenChange: expect.anything() })
  );
  act(() => root.unmount());
  host.remove();
});

it('bridges the frame fill through the shared Surface selector without a new persisted contract', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  act(() =>
    root.render(
      <HighlighterFillSurfaceField
        customCss="[card]\nbox-shadow: 0 4px 8px red;"
        inheritCustomCss
        label="Surface"
        onChange={onChange}
        value={createSolidPaint('#123456')}
      />
    )
  );
  const selector = mocks.surface.mock.lastCall?.[0] as {
    onChange(value: { fillPaint: ReturnType<typeof createSolidPaint>; surfaceCss: string }): void;
    presets: Array<{ id: string }>;
    value: { surfaceCss: string };
  };
  expect(selector.value.surfaceCss).toContain('box-shadow');
  expect(selector.presets).toEqual([{ enabled: true, id: 'surface-1' }]);
  act(() =>
    selector.onChange({
      fillPaint: createSolidPaint('#abcdef'),
      surfaceCss: '[card]\nfilter: none;',
    })
  );
  expect(onChange).toHaveBeenCalledWith({
    customCss: '[card]\nfilter: none;',
    fillPaint: createSolidPaint('#abcdef'),
    inheritCustomCss: true,
  });
  act(() => root.unmount());
  host.remove();
});
