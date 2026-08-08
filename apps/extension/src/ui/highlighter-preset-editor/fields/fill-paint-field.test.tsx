// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createSolidPaint } from '@sniptale/foundation/paint';

const mocks = vi.hoisted(() => ({ picker: vi.fn(), resources: vi.fn() }));
vi.mock('../../../composition/gradient-preset-resources/use-gradient-preset-catalog', () => ({
  useGradientPresetCatalog: mocks.resources,
}));
vi.mock('../../paint-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../paint-selector')>()),
  CompactPaintSelector: (props: unknown) => {
    mocks.picker(props);
    return <div data-testid="paint" />;
  },
}));

import { HighlighterFillPaintField } from './fill-paint-field';

it('is the sole thin Highlighter adapter for the universal Paint selector and preset owner', () => {
  const resources = { presets: [], actions: { onSave: vi.fn() } };
  mocks.resources.mockReturnValue(resources);
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
  expect(mocks.resources).toHaveBeenCalledWith('highlighter-frame-fill');
  expect(mocks.picker).toHaveBeenCalledWith(
    expect.objectContaining({
      value,
      onChange,
      onOpenChange,
      presets: resources.presets,
      presetActions: resources.actions,
    })
  );
  act(() => root.unmount());
  host.remove();
});

it('keeps the floating interaction callback optional outside Content surfaces', () => {
  mocks.resources.mockReturnValue({ presets: [], actions: {} });
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
