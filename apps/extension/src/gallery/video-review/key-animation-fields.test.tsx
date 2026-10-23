// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ReviewKeyFields } from './key-animation-fields';
import { REVIEW_KEY_DEFAULT } from '../../features/video/project/action-feedback/key-animation';

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

vi.mock('../../ui/compact-inspector-controls', async (original) => ({
  ...(await original<typeof import('../../ui/compact-inspector-controls')>()),
  SelectField: (p: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) => (
    <select aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      <option value="" />
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  ColorField: (p: { label: string; value: string; onChange(value: string): void }) => (
    <input aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}));
vi.mock('../../ui/compact-inspector-controls/control-renderers', () => ({
  CompactSegmentedSelector: (p: {
    ariaLabel: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) => (
    <select
      aria-label={p.ariaLabel}
      value={p.value}
      onChange={(event) => p.onChange(event.target.value)}
    >
      <option value="" />
      {p.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
it('provides local slider drafts, larger typed values, and per-property batch patches', () => {
  const change = vi.fn();
  const value = { ...REVIEW_KEY_DEFAULT, enabled: true };
  act(() =>
    root.render(
      <ReviewKeyFields
        values={[value, { ...value, style: { ...value.style, fontSize: 32 } }]}
        onChange={change}
      />
    )
  );
  const input = (name: string) =>
    host.querySelector<HTMLInputElement>(`input[aria-label="gallery.videoReview.${name}"]`)!;
  const edit = (node: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  };
  expect(input('key_fontSize').placeholder).toBe('—');
  expect(host.textContent).toContain('gallery.videoReview.clickMixed');
  const range = input('key_fontSize range');
  expect(range.max).toBe('48');
  act(() => edit(range, '40'));
  expect(change).not.toHaveBeenCalled();
  act(() => range.dispatchEvent(new Event('pointerup', { bubbles: true })));
  expect(change).toHaveBeenLastCalledWith({ style: { fontSize: 40 } });
  for (const [name, next, patch] of [
    ['key_fontSize', '80', { style: { fontSize: 80 } }],
    ['key_cornerRadius', '20', { style: { cornerRadius: 20 } }],
    ['key_margin', '120', { style: { margin: 120 } }],
    ['key_before', '300', { before: 0.3 }],
    ['key_after', '3000', { after: 3 }],
    ['key_offset', '-100', { offset: -0.1 }],
  ] as const) {
    const node = input(name);
    act(() => {
      node.focus();
      edit(node, next);
    });
    act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(change).toHaveBeenLastCalledWith(patch);
    expect(host.contains(document.activeElement)).toBe(false);
  }
  for (const name of ['keyColor', 'keyBackground']) act(() => edit(input(name), '#aabbcc80'));
  expect(change).toHaveBeenLastCalledWith({ style: { background: '#aabbcc80', opacity: 1 } });
  for (const [name, value] of [
    ['keyPosition', 'top-right'],
    ['keyEntrance', 'slide'],
    ['keyDisplay', 'off'],
  ]) {
    const node = host.querySelector<HTMLSelectElement>(
      `[aria-label="gallery.videoReview.${name}"]`
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  expect(change).toHaveBeenLastCalledWith({ enabled: false });
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.keyReset"]')!.click()
  );
  expect(change).toHaveBeenLastCalledWith(null);
  act(() => root.render(<ReviewKeyFields values={[REVIEW_KEY_DEFAULT]} onChange={change} />));
  expect(host.querySelectorAll('input[type="range"]')).toHaveLength(0);
});
