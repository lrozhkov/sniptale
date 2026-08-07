// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';
import { createSystemCalloutPresetCatalog } from '../../../../features/highlighter/callout-presets/catalog';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), presets: [] as CalloutPreset[] }));

vi.mock('@sniptale/ui/content-popover-adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/content-popover-adapter')>()),
  ContentPopoverAdapter: (props: { children: ReactNode; isOpen: boolean }) =>
    props.isOpen ? <div>{props.children}</div> : null,
}));
vi.mock(
  '../../../../composition/frame-annotation-controls/callout/body',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/frame-annotation-controls/callout/body')
    >()),
    CalloutSettingsPopoverContent: (props: {
      onApplyPreset: (preset: CalloutPreset) => void;
      onShowPresets: () => void;
    }) => (
      <>
        <button data-testid="show-templates" onClick={props.onShowPresets} type="button" />
        <button
          data-testid="apply-template"
          onClick={() => props.onApplyPreset(mocks.presets[0]!)}
          type="button"
        />
      </>
    ),
  })
);
vi.mock('../../../../composition/frame-annotation-controls/callout/preset-controller', () => ({
  useCalloutPresetPopoverController: () => ({
    catalog: {
      create: vi.fn(),
      error: null,
      isSaving: false,
      overwrite: vi.fn(),
      pendingPresetIds: new Set(),
      presets: mocks.presets,
      refresh: mocks.refresh,
      toggle: vi.fn(),
      visiblePresets: mocks.presets,
    },
    editor: {
      close: vi.fn(),
      isOpen: false,
      isSaving: false,
      open: vi.fn(),
      preset: undefined,
      reset: vi.fn(),
      save: vi.fn(),
    },
  }),
}));
vi.mock('../../../../composition/frame-annotation-controls/popover/position', () => ({
  useFrameAnnotationSettingsPopoverPosition: () => ({}),
}));

import { FutureCalloutSettingsPopover } from '../../../../composition/frame-annotation-controls/callout/popover';

afterEach(() => {
  mocks.refresh.mockReset();
  mocks.presets = [];
});

it('forwards catalog refresh to the toolbar mode switch', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () =>
    root.render(
      <FutureCalloutSettingsPopover
        anchorEl={null}
        isOpen
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        settings={createDefaultCalloutSettings()}
      />
    )
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-testid="show-templates"]')?.click()
  );

  expect(mocks.refresh).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  host.remove();
});

it('applies template title content to future callouts', async () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  mocks.presets = [{ ...preset, content: { titleText: 'Template title' } }];
  const onChange = vi.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () =>
    root.render(
      <FutureCalloutSettingsPopover
        anchorEl={null}
        isOpen
        onChange={onChange}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        settings={createDefaultCalloutSettings()}
      />
    )
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-testid="apply-template"]')?.click()
  );

  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: { bodyHtml: '', titleText: 'Template title' } })
  );
  await act(async () => root.unmount());
  host.remove();
});
