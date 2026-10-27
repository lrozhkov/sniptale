// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIModelCapabilities } from '../../../../../contracts/settings/ai-catalog';
import { formatNumber, getCurrentLocale, translate } from '../../../../../platform/i18n';
import { ModelProperties } from './model-properties';
const capabilities: AIModelCapabilities = {
  operations: { text: 'supported' },
  input: { audio: 'unsupported' },
  output: {},
  features: {},
  contextWindow: 1024,
};
let root: Root;
let container: HTMLDivElement;
let changed = vi.fn();
function Harness() {
  const [value, setValue] = useState(capabilities);
  return (
    <ModelProperties
      capabilities={value}
      onChange={(next) => {
        changed(next);
        setValue(next);
      }}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  changed = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('presents provider facts as definition lists without disabled inputs', async () => {
  await act(async () => root.render(<ModelProperties capabilities={capabilities} />));
  expect(container.querySelectorAll('input')).toHaveLength(0);
  expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(0);
  expect(container.querySelectorAll('dl').length).toBeGreaterThan(0);
  expect(container.textContent).toContain(translate('settings.aiProviders.modelSupportUnknown'));
  expect(container.textContent).toContain(formatNumber(1024, undefined, getCurrentLocale()));
});
it('changes separate operation, input, output and feature groups without inferring other support', async () => {
  await act(async () => root.render(<Harness />));
  for (const [group, key, property] of [
    ['modelOperationsTitle', 'modelOperationSpeech', 'operations'],
    ['modelInputTitle', 'modelModalityAudio', 'input'],
    ['modelOutputTitle', 'modelModalityAudio', 'output'],
    ['modelFeaturesTitle', 'modelFeatureTools', 'features'],
  ] as const) {
    const label = `${translate(`settings.aiProviders.${group}`)}: ${translate(`settings.aiProviders.${key}`)}`;
    const trigger = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === label
    );
    if (!trigger) throw new Error('Property control unavailable');
    await act(async () => trigger.click());
    const yes = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (option) => option.textContent?.trim() === translate('settings.aiProviders.modelSupportYes')
    );
    if (!yes) throw new Error('Support option unavailable');
    await act(async () => yes.click());
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ [property]: expect.any(Object) })
    );
  }
  expect(changed.mock.calls.at(-1)?.[0]).toMatchObject({
    operations: { text: 'supported', speech: 'supported' },
    input: { audio: 'supported' },
    output: { audio: 'supported' },
    features: { tools: 'supported' },
  });
});
it('changes and clears numeric limits while preserving capability maps', async () => {
  await act(async () => root.render(<Harness />));
  const fields = Array.from(container.querySelectorAll('input'));
  const input = fields.find(
    (field) =>
      field.getAttribute('aria-label') === translate('settings.aiProviders.modelMaxOutputTokens')
  );
  if (!input) throw new Error('Token limit unavailable');
  const change = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await change('2048');
  expect(changed.mock.calls.at(-1)?.[0]).toMatchObject({
    maxOutputTokens: 2048,
    contextWindow: 1024,
    operations: capabilities.operations,
  });
  await change('');
  expect(changed.mock.calls.at(-1)?.[0].maxOutputTokens).toBeUndefined();
});
