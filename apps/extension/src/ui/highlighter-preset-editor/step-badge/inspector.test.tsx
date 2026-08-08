// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  createStepBadgeSettingsFromTemplate,
  DEFAULT_STEP_BADGE_TEMPLATE,
} from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgeAppearanceSection } from './inspector';
import { StepBadgeCssSection } from './inspector-css';

it('renders linked size and semantic color controls', () => {
  const markup = renderToStaticMarkup(
    <StepBadgeAppearanceSection
      frame={{ borderColor: '#f97316', borderWidth: 4 }}
      onChange={vi.fn()}
      settings={createStepBadgeSettingsFromTemplate(DEFAULT_STEP_BADGE_TEMPLATE)}
    />
  );
  expect(markup).toContain('Размер и цвета');
  expect(markup).toContain('От рамки');
  expect(markup).toContain('Цвет рамки');
  expect(markup).toContain('Толщина обводки');
});

it('stores only valid safe custom CSS', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      <StepBadgeCssSection
        onChange={onChange}
        settings={createStepBadgeSettingsFromTemplate(DEFAULT_STEP_BADGE_TEMPLATE)}
      />
    )
  );
  const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    valueSetter?.call(textarea, '[badge]\nborder-radius: 6px;');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ style: expect.objectContaining({ customCss: textarea.value }) })
  );
  onChange.mockClear();
  await act(async () => {
    valueSetter?.call(textarea, '[badge]\nposition: fixed;');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(textarea.getAttribute('aria-invalid')).toBe('true');
  await act(async () => root.unmount());
  host.remove();
});

it('switches from linked sizing without a visual jump and routes color source changes', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      <StepBadgeAppearanceSection
        frame={{ borderColor: '#f97316', borderWidth: 4 }}
        onChange={onChange}
        settings={createStepBadgeSettingsFromTemplate(DEFAULT_STEP_BADGE_TEMPLATE)}
      />
    )
  );
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
  const customSize = buttons.find((button) => button.textContent === 'Свой');
  await act(async () => customSize?.click());
  const sizePatch = onChange.mock.calls[0]?.[0];
  expect(sizePatch.style.sizeSource).toBe('custom');
  expect(sizePatch.style.diameter).toBeCloseTo(29.16);
  const backgroundSource = host.querySelector<HTMLButtonElement>(
    '[data-step-badge-color-role="background"]'
  );
  await act(async () => backgroundSource?.click());
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      style: expect.objectContaining({ backgroundColorSource: 'frame-fill' }),
    })
  );
  await act(async () => root.unmount());
  host.remove();
});
