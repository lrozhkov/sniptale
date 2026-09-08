// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createTextClip } from '../../../../../features/video/project/factories/overlay-clip';
import { renderTransformFields } from './transform-fields';

it('keeps precise geometry available without mutating on disclosure and respects track locking', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const clip = createTextClip('track', 1920, 1080, 0);
  const update = vi.fn();
  try {
    act(() => root.render(renderTransformFields(clip, false, update)));
    const details = host.querySelector('details')!;
    expect(details.open).toBe(false);
    act(() => details.querySelector('summary')!.click());
    expect(details.open).toBe(true);
    expect(update).not.toHaveBeenCalled();
    const x = details.querySelector<HTMLInputElement>('input[aria-label="X"]')!;
    act(() => {
      x.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(x, '-120');
      x.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => x.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(update).toHaveBeenCalledExactlyOnceWith(clip.id, { x: -120 });
    act(() => root.render(renderTransformFields(clip, true, update)));
    expect(
      [...host.querySelectorAll<HTMLInputElement>('input')].every((input) => input.disabled)
    ).toBe(true);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
