// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { CaptionStyleFields } from './caption-style';
it('shares appearance commands and preserves the runtime numeric slot and disabled values', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const style = createReviewCaptionSettings().style;
  const onChange = vi.fn();
  try {
    act(() =>
      root.render(
        <CaptionStyleFields
          style={style}
          onChange={onChange}
          sizeControl={<input aria-label="Runtime size" defaultValue="4" />}
        />
      )
    );
    const position = host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[1]!;
    act(() => position.click());
    expect(onChange).toHaveBeenCalledWith({ ...style, position: 'top' });
    expect(host.querySelector<HTMLInputElement>('[aria-label="Runtime size"]')!.value).toBe('4');
    const colors = host.querySelectorAll<HTMLButtonElement>(
      '[data-ui="shared.ui.color-selector.value-trigger"]'
    );
    for (const [index, field] of ['color', 'background'].entries()) {
      act(() => colors[index]!.click());
      const input = host.querySelector<HTMLInputElement>('input:not([aria-label="Runtime size"])')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          '#112233'
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      expect(onChange).toHaveBeenLastCalledWith({ ...style, [field]: '#112233' });
    }
    act(() =>
      root.render(
        <CaptionStyleFields
          style={style}
          disabled
          onChange={onChange}
          sizeControl={<input aria-label="Runtime size" defaultValue="4" />}
        />
      )
    );
    expect(host.querySelector('fieldset')!.disabled).toBe(true);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
