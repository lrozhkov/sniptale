// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideImageBlock } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideImageControls } from './image-controls';
const block = createGuideImageBlock({
  id: 'image',
  assetId: 'asset',
  width: 800,
  height: 600,
  source: { kind: 'import', filename: 'image.png' },
});
const change = vi.fn();
let host: HTMLDivElement;
let root: Root;
let decoded: HTMLImageElement[];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  decoded = [];
  vi.stubGlobal(
    'Image',
    vi.fn(function () {
      const image = document.createElement('img');
      Object.defineProperty(image, 'naturalWidth', { value: 1200 });
      Object.defineProperty(image, 'naturalHeight', { value: 900 });
      decoded.push(image);
      return image;
    })
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(url: string | null = 'blob:image', disabled = false) {
  await act(async () =>
    root.render(
      <GuideImageControls
        block={block}
        url={url}
        disabled={disabled}
        onChange={change}
        onClose={vi.fn()}
        t={createTranslator('en')}
      />
    )
  );
}
async function click(name: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === name
  );
  if (!button) throw new Error(`Missing ${name}`);
  await act(async () => button.click());
}
it('changes fit and resets the frame from the decoded image dimensions', async () => {
  await render();
  await click('Fill');
  expect(change.mock.calls[0]?.[0].fit).toBe('cover');
  await act(async () => decoded[0]?.dispatchEvent(new Event('load')));
  await click('Reset frame and position');
  expect(change.mock.calls[1]?.[0].frame).toEqual({ width: 1200, height: 900 });
  await click('Zoom 100%');
  await click('Center image');
  expect(change).toHaveBeenCalledTimes(4);
});

it('edits bounded zoom/frame fields and keeps caption and alternative text as plain text', async () => {
  await render();
  const update = async (label: string, value: string) => {
    const field = [...host.querySelectorAll('label')]
      .find((node) => node.textContent === label)
      ?.querySelector('input');
    if (!field) throw new Error(`Missing ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  await update('Zoom, %', '200');
  expect(change.mock.calls.at(-1)?.[0].contentTransform.scale).toBe(2);
  await update('Frame width', '500');
  expect(change.mock.calls.at(-1)?.[0].frame.width).toBe(500);
  await update('Frame height', '350');
  expect(change.mock.calls.at(-1)?.[0].frame.height).toBe(350);
  await update('Caption', '<script>text</script>');
  expect(change.mock.calls.at(-1)?.[0].caption).toBe('<script>text</script>');
  await update('Alternative text', 'Description');
  expect(change.mock.calls.at(-1)?.[0].alt).toBe('Description');
  expect(host.querySelector('script')).toBeNull();
});

it('discards stale decode callbacks and disables reset until current media is ready', async () => {
  await render();
  const old = decoded[0]!;
  await render('blob:replacement');
  expect(old.onload).toBeNull();
  await act(async () => old.dispatchEvent(new Event('load')));
  await click('Reset frame and position');
  expect(change).not.toHaveBeenCalled();
  await act(async () => decoded[1]?.dispatchEvent(new Event('load')));
  await click('Reset frame and position');
  expect(change).toHaveBeenCalledOnce();
  await render(null);
  expect(decoded[1]?.onload).toBeNull();
  await click('Reset frame and position');
  expect(change).toHaveBeenCalledOnce();
});
it('keeps geometry disabled after a decode failure or while edits are locked', async () => {
  await render();
  await act(async () => decoded[0]?.dispatchEvent(new Event('error')));
  await click('Reset frame and position');
  expect(change).not.toHaveBeenCalled();
  await render('blob:image', true);
  await click('Zoom 100%');
  await click('Center image');
  expect(change).not.toHaveBeenCalled();
});
