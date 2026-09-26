// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ settings: {}, isLoading: false, updateSettings: vi.fn() }));
vi.mock('../../../runtime/store/useSettingsStore', () => ({ useSettingsStore: () => state }));
vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
import { FilenameRulesSettings } from './filename-rules';
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  state.settings = {};
  state.updateSettings.mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<FilenameRulesSettings />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function input(key: string) {
  return container.querySelector<HTMLInputElement>(`#filename-${key}`)!;
}
function button(key: string) {
  return [...container.querySelectorAll('button')].find(
    (node) => node.textContent === `settings.filenameRules.${key}`
  )!;
}
async function change(key: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input(key),
      value
    );
    input(key).dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('previews inheritance, blocks invalid save and retains a failed draft for retry', async () => {
  await change('template', '{bad}');
  expect(button('save').disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'settings.filenameRules.invalid'
  );
  await change('template', 'Project_{type}');
  expect(container.textContent).toContain('Project_images.png');
  await change('images', 'Shot');
  expect(container.textContent).toContain('Shot.png');
  state.updateSettings.mockRejectedValueOnce(new Error('quota'));
  await act(async () => button('save').click());
  expect(container.querySelector('p[role="status"]')?.textContent).toBe(
    'settings.filenameRules.failed'
  );
  expect(input('template').value).toBe('Project_{type}');
  await act(async () => button('save').click());
  expect(state.updateSettings).toHaveBeenCalledTimes(2);
  expect(state.updateSettings).toHaveBeenLastCalledWith({
    filenameRules: { template: 'Project_{type}', images: 'Shot' },
  });
});
it('inserts a variable in the focused category and resets only the draft', async () => {
  await act(async () => input('images').focus());
  await act(async () => button('date').click());
  expect(input('images').value).toBe('{date}');
  await act(async () => button('reset').click());
  expect(input('images').value).toBe('');
  expect(state.updateSettings).not.toHaveBeenCalled();
});

it('shows strict fallback for corrupted preferences until a valid reset is saved', async () => {
  state.settings = { filenameRules: null };
  await act(async () => root.render(<FilenameRulesSettings />));
  expect(container.textContent).toContain('Z_example_1.png');
  expect(container.textContent).toContain('settings.filenameRules.fallback');
  await act(async () => button('reset').click());
  expect(container.textContent).not.toContain('settings.filenameRules.fallback');
  await act(async () => button('save').click());
  expect(state.updateSettings).toHaveBeenCalledWith({ filenameRules: { template: '' } });
});
