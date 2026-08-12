// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createSolidPaint } from '@sniptale/foundation/paint';

const mocks = vi.hoisted(() => ({ picker: vi.fn() }));
vi.mock('../../paint-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../paint-selector')>()),
  CompactPaintSelector: (props: unknown) => {
    mocks.picker(props);
    return <div data-testid="paint" />;
  },
}));

import { HighlighterFillPaintField } from './fill-paint-field';

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
