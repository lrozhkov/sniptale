// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { translate } from '../../../../../platform/i18n';
import { ShadowField } from './shadow-field';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function renderField(value: string, onChange = vi.fn()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(<ShadowField disabled={false} label="Shadow" value={value} onChange={onChange} />);
  });

  return onChange;
}

function changeInput(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

it('commits offset edits as a serialized box-shadow value', () => {
  const onChange = renderField('0px 8px 18px 0px rgba(0, 0, 0, 0.2)');

  changeInput(translate('content.designReview.shadowOffsetX'), '4');

  expect(onChange).toHaveBeenCalledWith('4px 8px 18px 0px rgba(0, 0, 0, 0.2)');
});

it('allows switching the structured shadow off', async () => {
  const onChange = renderField('0px 8px 18px 0px rgba(0, 0, 0, 0.2)');

  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Shadow"]')?.click();
  });
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `button[role="option"][title="${translate('content.designReview.optionNone')}"]`
      )
      ?.click();
  });

  expect(onChange).toHaveBeenCalledWith('none');
});

it('steps focused shadow offsets through serialization without clamping negative lengths', () => {
  const onChange = renderField('0px 8px 18px 0px rgba(0, 0, 0, 0.2)');
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('content.designReview.shadowOffsetX')}"]`
  )!;
  input.focus();
  const wheel = new WheelEvent('wheel', { deltaY: 20, bubbles: true, cancelable: true });
  act(() => input.dispatchEvent(wheel));
  expect(wheel.defaultPrevented).toBe(true);
  expect(onChange).toHaveBeenCalledWith('-1px 8px 18px 0px rgba(0, 0, 0, 0.2)');
  expect(document.activeElement).toBe(input);
});

it('retains the shadow parser numeric domain when stepping exponential offsets', () => {
  const onChange = renderField('1e3px 8px 18px 0px #000000');
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('content.designReview.shadowOffsetX')}"]`
  )!;
  input.focus();
  act(() =>
    input.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -20,
        bubbles: true,
        cancelable: true,
      })
    )
  );
  expect(onChange).toHaveBeenCalledWith('1001px 8px 18px 0px #000000');
});
