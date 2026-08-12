// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it, vi } from 'vitest';
import { getCanonicalSystemCalloutPreset } from '../../features/highlighter/callout-presets/catalog';
import { CalloutBackgroundSettingsView } from './view';

const selectorProps = vi.hoisted(() => vi.fn());

vi.mock('../surface-style-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surface-style-selector')>()),
  SurfaceStyleSelector: (props: Record<string, unknown>) => {
    selectorProps(props);
    return <div data-ui="surface-selector" />;
  },
}));

const actions = {
  onCreate: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onRename: vi.fn(),
  onReorder: vi.fn(),
  onReset: vi.fn(),
  onToggleFavorite: vi.fn(),
  onUpdate: vi.fn(),
};

it('uses selection controls inline and management controls only when requested', async () => {
  const style = getCanonicalSystemCalloutPreset('system-callout-header-card').style;
  const value = { fillPaint: createSolidPaint('#ffffffff'), surfaceCss: '' };
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <CalloutBackgroundSettingsView
        actions={actions}
        manageStyles={false}
        onChange={vi.fn()}
        presets={[]}
        style={style}
        unsafeForWrite={false}
        value={value}
      />
    )
  );
  expect(selectorProps.mock.calls.at(-1)?.[0]).toMatchObject({ presentation: 'selection' });

  await act(async () =>
    root.render(
      <CalloutBackgroundSettingsView
        actions={actions}
        manageStyles
        onChange={vi.fn()}
        presets={[]}
        style={style}
        unsafeForWrite={false}
        value={value}
      />
    )
  );
  expect(selectorProps.mock.calls.at(-1)?.[0]).toMatchObject({ presentation: 'management' });
  act(() => root.unmount());
  host.remove();
});
