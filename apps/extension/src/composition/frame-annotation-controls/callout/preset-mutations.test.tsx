// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  reset: vi.fn(),
  toggle: vi.fn(),
  update: vi.fn(),
}));

const calloutPreset = vi.hoisted(() => ({
  content: { titleText: 'Inactive template title' },
  customized: false,
  enabled: true,
  id: 'inactive-template',
  name: 'Inactive template',
  order: 1,
  origin: 'user' as const,
  placement: { anchor: 'bottom-right' as const, side: 'bottom' as const },
  style: { surface: { backgroundColor: '#123456' } },
}));

vi.mock('../../../composition/persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/callout-presets')>()),
  createUserCalloutPreset: mocks.create,
  resetSystemCalloutPreset: mocks.reset,
  setCalloutPresetEnabled: mocks.toggle,
  updateCalloutPreset: mocks.update,
}));

vi.mock('./body', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./body')>()),
  CalloutSettingsPopoverContent: (props: Record<string, any>) => (
    <>
      <button data-action="apply-inactive" onClick={() => props['onApplyPreset'](calloutPreset)}>
        apply
      </button>
      <button data-action="fork-inactive" onClick={() => props['onForkPreset'](calloutPreset)}>
        fork
      </button>
      <button
        data-action="customize-style"
        onClick={() =>
          props['handleSettingChange']({ style: { surface: { backgroundColor: '#abcdef' } } })
        }
      >
        customize
      </button>
    </>
  ),
}));

vi.mock('./preset-controller', () => ({
  useCalloutPresetPopoverController: () => ({
    catalog: {
      create: vi.fn(),
      error: null,
      isSaving: false,
      overwrite: vi.fn(),
      pendingPresetIds: new Set(),
      presets: [calloutPreset],
      refresh: vi.fn(),
      toggle: vi.fn(),
      visiblePresets: [calloutPreset],
    },
    editor: { reset: vi.fn() },
  }),
}));

import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { createDefaultFrameCallout } from '../../../features/highlighter/frame-annotation/defaults';
import { useCalloutPresetPopoverMutations } from './preset-mutations';
import { FutureCalloutSettingsPopover } from './popover';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: ReturnType<typeof useCalloutPresetPopoverMutations> | null = null;
let state: { error: string | null; isSaving: boolean; pending: ReadonlySet<string> };
let sessionGenerationRef: React.MutableRefObject<number> | null = null;

function Harness() {
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [pending, setPendingPresetIds] = React.useState<ReadonlySet<string>>(new Set());
  const [, setEditor] = React.useState<{ isOpen: boolean }>({ isOpen: false });
  sessionGenerationRef = React.useRef(1);
  latest = useCalloutPresetPopoverMutations({
    sessionGenerationRef,
    setEditor,
    setError,
    setIsSaving,
    setPendingPresetIds,
  });
  state = { error, isSaving, pending };
  return null;
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  latest = null;
  state = { error: null, isSaving: false, pending: new Set() };
  for (const mock of Object.values(mocks))
    mock.mockReset().mockResolvedValue({ outcome: 'applied' });
});

it('drops a completed save from a stale popover session', async () => {
  let resolveCreate: ((value: { outcome: string }) => void) | undefined;
  mocks.create.mockImplementation(
    () => new Promise<{ outcome: string }>((resolve) => (resolveCreate = resolve))
  );
  await act(async () => root?.render(<Harness />));
  const preset = {
    ...createSystemCalloutPresetCatalog()[0]!,
    id: 'stale-user',
    origin: 'user' as const,
  };
  const pending = latest!.create(preset);
  sessionGenerationRef!.current += 1;
  resolveCreate?.({ outcome: 'applied' });
  await expect(pending).resolves.toBeNull();
});

it('forks a requested inactive creation template into live temporary settings', async () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const onChange = vi.fn();

  const settings = createDefaultFrameCallout();
  settings.content.titleText = 'Live heading';
  settings.style.badge.text = 'Live badge';
  await act(async () =>
    root?.render(
      <FutureCalloutSettingsPopover
        anchorEl={anchor}
        isOpen
        onChange={onChange}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        settings={settings}
      />
    )
  );
  act(() => document.querySelector<HTMLButtonElement>('[data-action="fork-inactive"]')?.click());

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({ titleText: 'Live heading' }),
      placement: expect.objectContaining(calloutPreset.placement),
      style: expect.objectContaining({
        surface: expect.objectContaining({ backgroundColor: '#123456' }),
      }),
    })
  );
  expect(onChange.mock.calls[0]?.[0]).toMatchObject({
    content: { titleText: 'Live heading' },
    style: { badge: { text: 'Live badge' } },
  });
  expect(onChange.mock.calls[0]?.[0].sourcePresetId).toBeUndefined();
  await act(async () =>
    root?.render(
      <FutureCalloutSettingsPopover
        anchorEl={anchor}
        isOpen={false}
        onChange={onChange}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        settings={settings}
      />
    )
  );
  anchor.remove();
});

it('still applies the heading and badge stored in a requested creation template', async () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const onChange = vi.fn();
  const settings = createDefaultFrameCallout();
  settings.content.titleText = 'Live heading';
  settings.style.badge.text = 'Live badge';

  await act(async () =>
    root?.render(
      <FutureCalloutSettingsPopover
        anchorEl={anchor}
        isOpen
        onChange={onChange}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        settings={settings}
      />
    )
  );
  act(() => document.querySelector<HTMLButtonElement>('[data-action="apply-inactive"]')?.click());

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({ titleText: calloutPreset.content.titleText }),
      sourcePresetId: calloutPreset.id,
      style: expect.objectContaining({
        surface: expect.objectContaining({ backgroundColor: '#123456' }),
      }),
    })
  );
  anchor.remove();
});

it('detaches a future callout from its template when its style is customized', async () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const onChange = vi.fn();
  const settings = createDefaultFrameCallout();
  settings.sourcePresetId = 'source-template';

  await act(async () =>
    root?.render(
      <FutureCalloutSettingsPopover
        anchorEl={anchor}
        isOpen
        onChange={onChange}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        settings={settings}
      />
    )
  );
  act(() => document.querySelector<HTMLButtonElement>('[data-action="customize-style"]')?.click());

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      style: expect.objectContaining({
        surface: expect.objectContaining({ backgroundColor: '#abcdef' }),
      }),
    })
  );
  expect(onChange.mock.calls[0]?.[0].sourcePresetId).toBeUndefined();
  anchor.remove();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

it('surfaces rejected and thrown toggle, save, reset, create and overwrite mutations', async () => {
  await act(async () => root?.render(<Harness />));
  const preset = { ...createSystemCalloutPresetCatalog()[0]!, customized: true };
  const userPreset = { ...preset, id: 'user-preset', origin: 'user' as const };

  mocks.toggle.mockResolvedValueOnce({ outcome: 'rejected' }).mockRejectedValueOnce(new Error());
  await act(async () => {
    await latest?.toggle(preset);
    await latest?.toggle(preset);
  });
  expect(state.error).not.toBeNull();
  expect(state.pending.size).toBe(0);

  mocks.update
    .mockResolvedValueOnce({ outcome: 'rejected' })
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce({ outcome: 'rejected' })
    .mockRejectedValueOnce(new Error());
  await act(async () => {
    await latest?.save(preset);
    await latest?.save(preset);
    expect(await latest?.overwrite(userPreset)).toBeNull();
    expect(await latest?.overwrite(userPreset)).toBeNull();
  });

  mocks.reset.mockResolvedValueOnce({ outcome: 'rejected' }).mockRejectedValueOnce(new Error());
  await act(async () => {
    await latest?.reset(userPreset);
    await latest?.reset(preset);
    await latest?.reset(preset);
  });

  mocks.create.mockResolvedValueOnce({ outcome: 'rejected' }).mockRejectedValueOnce(new Error());
  await act(async () => {
    expect(await latest?.create(userPreset)).toBeNull();
    expect(await latest?.create(userPreset)).toBeNull();
  });
  expect(state.isSaving).toBe(false);
});
