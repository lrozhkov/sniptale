// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NormalizedSettings, SettingsPatch } from '../../../../contracts/settings';
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
import { PageControlVisibility } from '../controls/control-visibility';
import { Clock } from 'lucide-react';
import {
  PageToolbarCustomizationDone,
  PageToolbarCustomizationSettings,
} from '../capture/page-control-settings';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let controls: ReturnType<typeof usePageToolbarControls>;
function Harness(props: { enabled: boolean }) {
  controls = usePageToolbarControls(props.enabled);
  return null;
}

it('intercepts customization clicks instead of executing the wrapped command', async () => {
  const command = vi.fn();
  function ButtonHarness() {
    controls = usePageToolbarControls(true);
    return (
      <PageToolbarControlsContext.Provider value={controls}>
        <PageControlVisibility control="capture-delay" icon={<Clock />} label="Delay">
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
