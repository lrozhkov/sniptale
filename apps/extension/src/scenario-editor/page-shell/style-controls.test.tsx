// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator, translate } from '../../platform/i18n';
import { GuideStyleFields } from './style-controls';

it('emits only each edited style property so other defaults remain inherited', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GuideStyleFields
          style={{ ...createGuideProject('Guide').style, accentColor: '#123456' }}
          disabled={false}
          onChange={change}
          t={createTranslator('en')}
        />
      )
    );
    const pickerTrigger = host.querySelector<HTMLButtonElement>(
      '[data-ui="shared.ui.color-selector.picker-trigger"]'
    )!;
    await act(async () => pickerTrigger.click());
    const palette = document.querySelector('[data-ui="shared.ui.color-selector.picker-palette"]')!;
    const colors = palette.querySelectorAll<HTMLButtonElement>('button');
    expect(colors.length).toBeGreaterThanOrEqual(8);
    await act(async () => colors[0]!.click());
    expect(change).not.toHaveBeenCalled();
    const picker = document.querySelector('[data-ui="shared.ui.color-selector.picker"]')!;
    const apply = [...picker.querySelectorAll('button')].find(
      (button) => button.textContent === translate('shared.ui.colorSelectorApply')
    )!;
    await act(async () => apply.click());
    expect(Object.keys(change.mock.lastCall?.[0] ?? {})).toEqual(['accentColor']);
    const cases = [
      ['Warm', { theme: 'warm' }],
      ['Serif', { font: 'serif' }],
      ['Compact', { density: 'compact' }],
      ['Wide', { contentWidth: 'wide' }],
      ['Strong', { imageBorder: 'strong' }],
      ['Plain', { numberStyle: 'plain' }],
    ] as const;
    for (const [label, patch] of cases) {
      await chooseStyle(host, label);
      expect(change).toHaveBeenLastCalledWith(patch);
    }
    const reset = host.querySelector<HTMLButtonElement>('.guide-style-accent > button')!;
    await act(async () => reset.click());
    expect(change).toHaveBeenLastCalledWith({ accentColor: null });
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

async function chooseStyle(host: HTMLElement, label: string) {
  const fields: Record<string, string> = {
    Compact: 'Spacing',
    Wide: 'Content width',
    Strong: 'Image border',
  };
  const field = fields[label];
  if (field) {
    await act(async () =>
      host.querySelector<HTMLButtonElement>(`[aria-label="${field}"]`)!.click()
    );
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (node) => node.textContent === label
    )!;
    await act(async () => option.click());
    return;
  }
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent === label);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
