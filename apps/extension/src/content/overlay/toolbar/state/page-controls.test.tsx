// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  NormalizedSettings,
  SettingsPatch,
  PageToolbarMode,
} from '../../../../contracts/settings';
const persistence = vi.hoisted(() => ({
  load: vi.fn<() => Promise<NormalizedSettings>>(),
  patch: vi.fn<(patch: SettingsPatch) => Promise<NormalizedSettings>>(),
}));
vi.mock('../../../../composition/persistence/settings', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: persistence.load,
  patchSettings: persistence.patch,
}));
import { createDefaultSettings } from '../../../../composition/persistence/settings';
import { PageToolbarControlsContext, usePageToolbarControls } from './page-controls';
import { PageControlVisibility, PageProtectedControls } from '../controls/control-visibility';
import {
  PageToolbarCustomizationDone,
  PageToolbarCustomizationSettings,
} from '../capture/page-control-settings';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let controls: ReturnType<typeof usePageToolbarControls>;
function Harness(props: { enabled: boolean; mode?: PageToolbarMode }) {
  controls = usePageToolbarControls(props.enabled, props.mode);
  return null;
}

it('uses native disabled semantics for required controls only while customizing', async () => {
  function ProtectedHarness() {
    controls = usePageToolbarControls(true);
    return (
      <PageToolbarControlsContext.Provider value={controls}>
        <PageProtectedControls>
          <button>Required</button>
        </PageProtectedControls>
      </PageToolbarControlsContext.Provider>
    );
  }
  await act(async () => root.render(<ProtectedHarness />));
  expect(host.querySelector('button')!.matches(':disabled')).toBe(false);
  act(() => controls.toggleEditing());
  expect(host.querySelector('button')!.matches(':disabled')).toBe(true);
  act(() => controls.toggleEditing());
  expect(host.querySelector('button')!.matches(':disabled')).toBe(false);
});

it('keeps explicit mode choices after global changes and can restore inheritance', async () => {
  const defaults = createDefaultSettings();
  persistence.load.mockResolvedValueOnce(defaults);
  await act(async () => root.render(<Harness enabled mode="drawing" />));
  expect(controls.isOverridden('capture-full')).toBe(false);
  const explicit = {
    ...defaults,
    contentToolbar: {
      ...defaults.contentToolbar!,
      pageControlOverrides: { drawing: { 'capture-full': true } },
    },
  };
  persistence.patch.mockResolvedValueOnce(explicit);
  await act(async () => controls.setVisible('capture-full', true));
  expect(persistence.patch).toHaveBeenLastCalledWith({
    contentToolbar: { pageControlOverrides: { drawing: { 'capture-full': true } } },
  });
  expect(controls.isOverridden('capture-full')).toBe(true);
  await act(async () => root.render(<Harness enabled mode="cursor" />));
  const hidden = {
    ...explicit,
    contentToolbar: { ...explicit.contentToolbar, pageControls: { 'capture-full': false } },
  };
  persistence.patch.mockResolvedValueOnce(hidden);
  await act(async () => controls.setVisible('capture-full', false));
  await act(async () => root.render(<Harness enabled mode="highlighter" />));
  expect(controls.isVisible('capture-full')).toBe(false);
  await act(async () => root.render(<Harness enabled mode="drawing" />));
  expect(controls.isVisible('capture-full')).toBe(true);
  persistence.patch.mockResolvedValueOnce({
    ...hidden,
    contentToolbar: {
      ...hidden.contentToolbar,
      pageControlOverrides: { drawing: { 'capture-full': null } },
    },
  });
  await act(async () => controls.resetOverrides());
  expect(controls.isVisible('capture-full')).toBe(false);
  expect(controls.hasOverrides).toBe(false);
});

it('retains the originating mode for a delayed write and retries refused overrides', async () => {
  await act(async () => root.render(<Harness enabled mode="drawing" />));
  let complete!: (settings: NormalizedSettings) => void;
  persistence.patch.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  let write!: Promise<void>;
  act(() => {
    write = controls.setVisible('capture-full', false);
  });
  await act(async () => root.render(<Harness enabled mode="design-review" />));
  const defaults = createDefaultSettings();
  await act(async () => {
    complete({
      ...defaults,
      contentToolbar: {
        ...defaults.contentToolbar!,
        pageControlOverrides: { drawing: { 'capture-full': false } },
      },
    });
    await write;
  });
  expect(controls.isVisible('capture-full')).toBe(true);
  await act(async () => root.render(<Harness enabled mode="drawing" />));
  expect(controls.isVisible('capture-full')).toBe(false);
  persistence.patch.mockRejectedValueOnce(new Error('refused'));
  await act(async () => controls.setVisible('capture-full', true));
  expect(controls.isVisible('capture-full')).toBe(false);
  persistence.patch.mockResolvedValueOnce({
    ...defaults,
    contentToolbar: {
      ...defaults.contentToolbar!,
      pageControlOverrides: { drawing: { 'capture-full': true } },
    },
  });
  await act(async () => controls.setVisible('capture-full', true));
  expect(controls.isVisible('capture-full')).toBe(true);
});

function VisualHarness() {
  controls = usePageToolbarControls(true);
  return (
    <PageToolbarControlsContext.Provider value={controls}>
      {(['capture-full', 'capture-size'] as const).map((control) => (
        <PageControlVisibility key={control} control={control} label={control}>
          <button>
            <svg data-original-icon={control}>
              <path d="M2 2 L18 18" />
            </svg>
          </button>
        </PageControlVisibility>
      ))}
    </PageToolbarControlsContext.Provider>
  );
}

it('exits through Done while an admitted visibility write is pending', async () => {
  let complete!: (settings: NormalizedSettings) => void;
  persistence.patch.mockReturnValueOnce(new Promise((resolve) => (complete = resolve)));
  function PendingDoneHarness() {
    controls = usePageToolbarControls(true, 'drawing');
    return (
      <PageToolbarControlsContext.Provider value={controls}>
        <PageToolbarCustomizationDone onCloseMenus={() => undefined} />
      </PageToolbarControlsContext.Provider>
    );
  }
  await act(async () => root.render(<PendingDoneHarness />));
  act(() => controls.toggleEditing());
  let write!: Promise<void>;
  act(() => {
    write = controls.setVisible('capture-full', false);
  });
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.customize-done"]')!.click()
  );
  expect(controls.editing).toBe(false);
  expect(controls.pending).toBe(true);
  const defaults = createDefaultSettings();
  await act(async () => {
    complete({
      ...defaults,
      contentToolbar: {
        ...defaults.contentToolbar!,
        pageControlOverrides: { drawing: { 'capture-full': false } },
      },
    });
    await write;
  });
  expect(controls.isVisible('capture-full')).toBe(false);
  expect(controls.editing).toBe(false);
});

it('uses the actual control icons during customization instead of substitute icons', async () => {
  await act(async () => root.render(<VisualHarness />));
  act(() => controls.toggleEditing());
  expect(host.querySelectorAll('svg[data-original-icon]')).toHaveLength(2);
});

it('keeps every customization button mounted and enabled while a choice is saved', async () => {
  let complete!: (settings: NormalizedSettings) => void;
  persistence.patch.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  await act(async () => root.render(<VisualHarness />));
  act(() => controls.toggleEditing());
  const buttons = [
    ...host.querySelectorAll<HTMLButtonElement>('[data-ui^="content.toolbar.visibility."]'),
  ];
  act(() => buttons[0]!.click());
  expect(buttons.every((button) => button.isConnected && !button.disabled)).toBe(true);
  await act(async () => complete(createDefaultSettings()));
  expect(buttons.every((button) => button.isConnected && !button.disabled)).toBe(true);
});

it('intercepts customization clicks instead of executing the wrapped command', async () => {
  const command = vi.fn();
  function ButtonHarness() {
    controls = usePageToolbarControls(true);
    return (
      <PageToolbarControlsContext.Provider value={controls}>
        <PageControlVisibility control="capture-delay" label="Delay">
          <button onClick={command}>Run command</button>
        </PageControlVisibility>
      </PageToolbarControlsContext.Provider>
    );
  }
  await act(async () => root.render(<ButtonHarness />));
  act(() => controls.toggleEditing());
  persistence.patch.mockResolvedValueOnce(createDefaultSettings());
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.visibility.capture-delay"]')
      ?.click()
  );
  expect(command).not.toHaveBeenCalled();
  act(() => controls.toggleEditing());
  await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
  expect(command).toHaveBeenCalledOnce();
});
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  persistence.load.mockResolvedValue({
    ...createDefaultSettings(),
    contentToolbar: {
      ...createDefaultSettings().contentToolbar!,
      pageControls: { 'capture-delay': false },
    },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('reveals controls for customization or this session only', async () => {
  await act(async () => root.render(<Harness enabled />));
  expect(controls.isVisible('capture-delay')).toBe(false);
  act(() => controls.toggleEditing());
  expect(controls.isVisible('capture-delay')).toBe(true);
  act(() => controls.toggleEditing());
  expect(controls.isVisible('capture-delay')).toBe(false);
  act(() => controls.toggleRevealed());
  expect(controls.isVisible('capture-delay')).toBe(true);
  await act(async () => root.render(<Harness enabled={false} />));
  await act(async () => root.render(<Harness enabled />));
  expect(controls.editing).toBe(false);
  expect(controls.revealed).toBe(false);
  expect(controls.isVisible('capture-delay')).toBe(false);
  expect(persistence.patch).not.toHaveBeenCalled();
});
it('retains acknowledged choices after failure, retries, and exits customization with Escape', async () => {
  await act(async () => root.render(<Harness enabled />));
  persistence.patch.mockRejectedValueOnce(new Error('refused'));
  await act(async () => controls.setVisible('capture-delay', true));
  expect(controls.isVisible('capture-delay')).toBe(false);
  expect(controls.error).not.toBeNull();
  persistence.patch.mockResolvedValueOnce(createDefaultSettings());
  await act(async () => controls.setVisible('capture-delay', true));
  expect(controls.isVisible('capture-delay')).toBe(true);
  act(() => controls.toggleEditing());
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(controls.editing).toBe(false);
});
it('does not load page preferences for the recording toolbar', async () => {
  await act(async () => root.render(<Harness enabled={false} />));
  expect(persistence.load).not.toHaveBeenCalled();
  expect(controls.isVisible('capture-delay')).toBe(true);
});

it('reloads after unavailable storage without enabling customization prematurely', async () => {
  persistence.load.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => root.render(<Harness enabled />));
  act(() => controls.toggleEditing());
  expect(controls.editing).toBe(false);
  expect(controls.error).not.toBeNull();
  await act(async () => controls.reload());
  expect(controls.ready).toBe(true);
  expect(controls.error).toBeNull();
  expect(controls.isVisible('capture-delay')).toBe(false);
});

it('does not publish a late save into a new toolbar session or admit duplicate writes', async () => {
  await act(async () => root.render(<Harness enabled />));
  let finish!: (settings: NormalizedSettings) => void;
  persistence.patch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let saving!: Promise<void>;
  act(() => {
    saving = controls.setVisible('capture-delay', true);
  });
  await act(async () => controls.setVisible('capture-delay', true));
  expect(persistence.patch).toHaveBeenCalledOnce();
  await act(async () => root.render(<Harness enabled={false} />));
  await act(async () => root.render(<Harness enabled />));
  await act(async () => {
    finish(createDefaultSettings());
    await saving;
  });
  expect(controls.isVisible('capture-delay')).toBe(false);
  expect(controls.pending).toBe(false);
});

it('operates customization, temporary reveal, Done and failure retry through the settings controls', async () => {
  const closeMenu = vi.fn();
  function SettingsHarness() {
    controls = usePageToolbarControls(true);
    return (
      <PageToolbarControlsContext.Provider value={controls}>
        <PageToolbarCustomizationSettings onClose={closeMenu} />
        <PageToolbarCustomizationDone onCloseMenus={closeMenu} />
      </PageToolbarControlsContext.Provider>
    );
  }
  const button = (suffix: string) =>
    host.querySelector<HTMLButtonElement>(`[data-ui="content.toolbar.${suffix}"]`);
  await act(async () => root.render(<SettingsHarness />));
  expect(button('customize-done')).toBeNull();
  await act(async () => button('settings.customize-buttons')?.click());
  expect(controls.editing).toBe(true);
  expect(closeMenu).toHaveBeenCalledOnce();
  await act(async () => button('customize-done')?.click());
  expect(controls.editing).toBe(false);
  await act(async () => button('settings.show-hidden-buttons')?.click());
  expect(controls.revealed).toBe(true);
  expect(button('settings.show-hidden-buttons')?.getAttribute('aria-pressed')).toBe('true');
  await act(async () => button('settings.customize-buttons')?.click());
  expect(controls.editing).toBe(true);
  expect(controls.revealed).toBe(false);
  persistence.patch.mockRejectedValueOnce(new Error('write refused'));
  await act(async () => controls.setVisible('capture-delay', true));
  expect(button('settings.visibility-retry')).not.toBeNull();
  await act(async () => button('settings.visibility-retry')?.click());
  expect(controls.error).toBeNull();
  expect(button('settings.visibility-retry')).toBeNull();
});
