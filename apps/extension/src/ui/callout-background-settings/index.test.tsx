// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it, vi } from 'vitest';
import { getCanonicalSystemCalloutPreset } from '../../features/highlighter/callout-presets/catalog';

vi.mock(
  '../../composition/surface-style-preset-resources/use-surface-style-preset-catalog',
  async (importOriginal) => ({
    ...(await importOriginal()),
    useSurfaceStylePresetCatalog: () => ({
      catalog: { catalogRevision: 0, unsafeForWrite: false },
      presets: [],
      actions: {
        onCreate: vi.fn(),
        onDelete: vi.fn(),
        onDuplicate: vi.fn(),
        onRename: vi.fn(),
        onReorder: vi.fn(),
        onToggleFavorite: vi.fn(),
        onUpdate: vi.fn(),
        onReset: vi.fn(),
      },
    }),
  })
);
vi.mock('../surface-style-selector', async (importOriginal) => ({
  ...(await importOriginal()),
  SurfaceStyleSelector: (props: {
    onChange: (value: {
      fillPaint: ReturnType<typeof createSolidPaint>;
      surfaceCss: string;
    }) => void;
  }) => (
    <button
      data-ui="surface-selector-mock"
      onClick={() =>
        props.onChange({
          fillPaint: createSolidPaint('#12345678'),
          surfaceCss: 'background-color: #fff;',
        })
      }
    >
      Apply
    </button>
  ),
}));

import { CalloutBackgroundSettings } from '.';

it('applies a Surface snapshot while preserving unrelated Callout sections and warns on CSS paint overrides', async () => {
  const original = getCanonicalSystemCalloutPreset('system-callout-header-card').style;
  const onChange = vi.fn();
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () =>
    root.render(<CalloutBackgroundSettings style={original} onChange={onChange} />)
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-ui="surface-selector-mock"]')!.click()
  );
  const next = onChange.mock.calls[0]![0];
  expect(next.surface.fillPaint).toEqual(createSolidPaint('#12345678'));
  expect(next.connector).toEqual(original.connector);
  expect(next.customCss).toContain('[title]');
  expect(next.customCss).toContain('background-color: #fff;');
});
