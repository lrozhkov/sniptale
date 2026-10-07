// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ReviewClickFields } from './click-animation-fields';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const click = { ...REVIEW_CLICK_DEFAULT, effect: 'ripple' as const };
const field = (name: string, type = 'text') =>
  host.querySelector<HTMLInputElement>(
    `input[type="${type}"][aria-label="gallery.videoReview.${name}${type === 'range' ? ' range' : ''}"]`
  )!;
function input(node: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
}

it('provides common slider ranges while accepting larger typed values', () => {
  const change = vi.fn();
  act(() => root.render(<ReviewClickFields values={[click]} onChange={change} />));
  expect(host.querySelectorAll('input[type="range"]')).toHaveLength(9);
  const radius = field('clickRadius', 'range');
  expect(radius.min).toBe('2');
  expect(radius.max).toBe('80');
  act(() => {
    field('clickRadius').focus();
    input(field('clickRadius'), '150');
  });
  act(() =>
    field('clickRadius').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
  );
  expect(change).toHaveBeenCalledExactlyOnceWith({ radius: 150 });
  expect(host.contains(document.activeElement)).toBe(false);
});

it('shows slider drafts locally and commits one changed field for mixed selections', () => {
  const change = vi.fn();
  act(() =>
    root.render(<ReviewClickFields values={[click, { ...click, radius: 40 }]} onChange={change} />)
  );
  expect(field('clickRadius').placeholder).toBe('—');
  const range = field('clickRadius', 'range');
  expect(range).not.toBeNull();
  act(() => input(range, '50'));
  expect(field('clickRadius').value).toBe('50');
  act(() => input(range, '60'));
  expect(change).not.toHaveBeenCalled();
  act(() => range.dispatchEvent(new Event('pointerup', { bubbles: true })));
  expect(change).toHaveBeenCalledExactlyOnceWith({ radius: 60 });
});
