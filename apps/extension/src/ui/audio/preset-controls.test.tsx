// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AudioPresetControls } from './preset-controls';
import {
  listBuiltInAudioPresets,
  materializeAudioProcessingPreset,
} from '../../features/video/audio/effects/presets';
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});
function render(overrides: Partial<ComponentProps<typeof AudioPresetControls>> = {}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const value = materializeAudioProcessingPreset(listBuiltInAudioPresets()[0]!.preset)!;
  const props: ComponentProps<typeof AudioPresetControls> = {
    items: [
      {
        id: 'builtin:speech',
        label: 'Speech',
        enabled: true,
        unavailable: false,
        isUser: false,
        isDefault: false,
      },
      {
        id: 'user-1',
        label: 'Mine',
        enabled: true,
        unavailable: false,
        isUser: true,
        isDefault: false,
      },
    ],
    selectedId: '',
    modified: false,
    busy: false,
    canWrite: true,
    error: null,
    hasValue: true,
    select: vi.fn(() => value),
    onApply: vi.fn(),
    save: vi.fn(async () => true),
    rename: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    importFile: vi.fn(async () => true),
    exportCurrent: vi.fn(),
    reload: vi.fn(async () => undefined),
    ...overrides,
  };
  act(() => root.render(<AudioPresetControls {...props} />));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  const click = (label: string) => {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="audioProcessing.presets.${label}"]`
    );
    if (!button) throw new Error('Missing preset control');
    act(() => button.click());
  };
  return {
    host,
    props,
    value,
    click,
    update: (next: Partial<ComponentProps<typeof AudioPresetControls>>) =>
      act(() => root.render(<AudioPresetControls {...props} {...next} />)),
  };
}
it('applies one explicitly selected preset through the caller command only', async () => {
  const { host, props, value } = render();
  await act(async () => {
    host.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!.click();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  });
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((node) =>
    node.textContent?.includes('Speech')
  )!;
  expect(option).toBeDefined();
  await act(async () => option.click());
  expect(props.select).toHaveBeenCalledExactlyOnceWith('builtin:speech');
  expect(props.onApply).toHaveBeenCalledExactlyOnceWith(value);
});
it('keeps the name draft local and saves once on confirmation', async () => {
  const { host, props, click } = render();
  click('save');
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="audioProcessing.presets.name"]'
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'My sound'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(props.save).not.toHaveBeenCalled();
  await act(async () => click('confirm'));
  expect(props.save).toHaveBeenCalledExactlyOnceWith('My sound');
  expect(props.onApply).not.toHaveBeenCalled();
});
it('does not apply a replacement when catalogue entries are deleted or when an error arrives', () => {
  const { props, update } = render({ selectedId: 'user-1', modified: true });
  update({ items: [], error: 'load' });
  expect(props.onApply).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('audioProcessing.presets.loadFailed');
});
it('keeps all actions disabled for a locked audio target and protects the current default', () => {
  const { host, props, click } = render({ disabled: true, selectedId: 'user-1' });
  for (const button of host.querySelectorAll<HTMLButtonElement>('button'))
    expect(button.disabled).toBe(true);
  click('save');
  click('remove');
  expect(props.save).not.toHaveBeenCalled();
  expect(props.remove).not.toHaveBeenCalled();
});
it('prevents deleting the default while retaining explicit rename and export', () => {
  const { host } = render({
    selectedId: 'user-1',
    items: [
      {
        id: 'user-1',
        label: 'Mine',
        enabled: true,
        unavailable: false,
        isUser: true,
        isDefault: true,
      },
    ],
  });
  expect(
    host.querySelector<HTMLButtonElement>('button[aria-label="audioProcessing.presets.remove"]')!
      .disabled
  ).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('button[aria-label="audioProcessing.presets.rename"]')!
      .disabled
  ).toBe(false);
  expect(
    host.querySelector<HTMLButtonElement>('button[aria-label="audioProcessing.presets.export"]')!
      .disabled
  ).toBe(false);
});

it('retains the rename intent from the original catalogue snapshot across a resource replacement', async () => {
  const { host, props, click, update } = render({ selectedId: 'user-1' });
  click('rename');
  const replacement = vi.fn(async () => true);
  update({ rename: replacement });
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="audioProcessing.presets.name"]'
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Renamed'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => click('confirm'));
  expect(props.rename).toHaveBeenCalledExactlyOnceWith('user-1', 'Renamed');
  expect(replacement).not.toHaveBeenCalled();
  expect(props.onApply).not.toHaveBeenCalled();
});
it('keeps rename local until confirmation and retains a rejected name for retry', async () => {
  const rename = vi.fn(async () => false);
  const { host, click } = render({ selectedId: 'user-1', rename });
  click('rename');
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="audioProcessing.presets.name"]'
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Renamed'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => click('confirm'));
  expect(rename).toHaveBeenCalledExactlyOnceWith('user-1', 'Renamed');
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="audioProcessing.presets.name"]')?.value
  ).toBe('Renamed');
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('input[aria-label="audioProcessing.presets.name"]')).toBeNull();
});
it('forwards file import, deletion, export and retry to their supplied owners', async () => {
  const { host, props, click } = render({ selectedId: 'user-1', error: 'load' });
  click('remove');
  click('export');
  expect(props.remove).toHaveBeenCalledExactlyOnceWith('user-1');
  expect(props.exportCurrent).toHaveBeenCalledOnce();
  const file = new File(['{}'], 'sound.json', { type: 'application/json' });
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file] });
  act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(props.importFile).toHaveBeenCalledExactlyOnceWith(file);
  expect(input.value).toBe('');
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'audioProcessing.presets.retry')!
      .click()
  );
  expect(props.reload).toHaveBeenCalledOnce();
});
