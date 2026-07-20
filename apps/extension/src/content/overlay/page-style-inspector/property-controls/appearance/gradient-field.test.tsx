// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { translate } from '../../../../../platform/i18n';
import { GradientField } from './gradient-field';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function renderField(value: string, onChange = vi.fn()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(
      <GradientField disabled={false} label="Gradient" value={value} onChange={onChange} />
    );
  });

  return onChange;
}

function changeInput(value: string) {
  const input = document.querySelector<HTMLInputElement>('input');
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

it('commits angle edits as a serialized linear-gradient value', () => {
  const onChange = renderField('linear-gradient(90deg, #fff 0%, #111 100%)');

  changeInput('135');

  expect(onChange).toHaveBeenCalledWith('linear-gradient(135deg, #fff 0%, #111 100%)');
});

it('allows switching the structured gradient off', async () => {
  const onChange = renderField('linear-gradient(90deg, #fff 0%, #111 100%)');

  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Gradient"]')?.click();
  });
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `button[role="option"][title="${translate('content.pageStyleInspector.optionNone')}"]`
      )
      ?.click();
  });

  expect(onChange).toHaveBeenCalledWith('none');
});
