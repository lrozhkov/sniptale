// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideImageBlock } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideImageControls } from './image-controls';
import { GuideLayoutAssistance, useGuideImageBounds } from './layout-assistance';
const requestResource = vi.hoisted(() => vi.fn());
vi.mock('./resource-drawer', () => ({ useGuideResourceRequest: () => requestResource }));
const block = createGuideImageBlock({
  id: 'image',
  assetId: 'asset',
  width: 800,
  height: 600,
  source: { kind: 'import', filename: 'image.png' },
});
const change = vi.fn();
const close = vi.fn();
const edit = vi.fn();
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
async function render(url: string | null = 'blob:image', disabled = false, image = block) {
  await act(async () =>
    root.render(
      <GuideImageControls
        stepId="step"
        onEdit={edit}
        block={image}
        url={url}
        disabled={disabled}
        onChange={change}
        onClose={close}
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
  await click('Center image');
  expect(change).toHaveBeenCalledTimes(3);
});

it('edits bounded zoom/frame fields and keeps caption and alternative text as plain text', async () => {
  await render();
  const update = async (label: string, value: string) => {
    const field =
      host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ??
      [...host.querySelectorAll('label')]
        .find((node) => node.textContent === label)
        ?.querySelector('input');
    if (!field) throw new Error(`Missing ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
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
  expect(host.textContent).toContain('Describes the image to screen readers');
  expect(host.querySelector('script')).toBeNull();
});

it('synchronizes visible sliders with zoom and frame values', async () => {
  await render();
  const ranges = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  expect(ranges.map((range) => range.getAttribute('aria-label'))).toEqual([
    'Zoom, %',
    'Frame width',
    'Frame height',
  ]);
  expect(ranges.map((range) => range.value)).toEqual(['100', '800', '600']);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      ranges[0],
      '200'
    );
    ranges[0]?.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(change.mock.calls.at(-1)?.[0].contentTransform.scale).toBe(2);
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
  await click('Center image');
  expect(change).not.toHaveBeenCalled();
});

it('holds inspector geometry when bounds are on until the current image decodes', async () => {
  function BoundedControls() {
    const { setCropBounds } = useGuideImageBounds(block);
    return (
      <>
        <button onClick={() => setCropBounds(true)}>Bounds on</button>
        <GuideImageControls
          block={block}
          url="blob:image"
          disabled={false}
          onChange={change}
          onClose={close}
          t={createTranslator('en')}
        />
      </>
    );
  }
  await act(async () =>
    root.render(
      <GuideLayoutAssistance>
        <BoundedControls />
      </GuideLayoutAssistance>
    )
  );
  await click('Bounds on');
  expect(host.querySelector<HTMLFieldSetElement>('.guide-image-controls fieldset')?.disabled).toBe(
    true
  );
  const caption = host.querySelector<HTMLInputElement>('.guide-image-description input')!;
  expect(caption.matches(':disabled')).toBe(false);
  const htmlToggle = host.querySelector<HTMLButtonElement>('.guide-html-switch button')!;
  expect(htmlToggle.matches(':disabled')).toBe(false);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      caption,
      'Still editable'
    );
    caption.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(change.mock.calls.at(-1)?.[0].caption).toBe('Still editable');
  await act(async () => decoded[0]?.dispatchEvent(new Event('load')));
  expect(host.querySelector<HTMLFieldSetElement>('.guide-image-controls fieldset')?.disabled).toBe(
    false
  );
});

it('lets numeric Escape cancel the draft before inspector dismissal', async () => {
  await render();
  const field = host.querySelector<HTMLInputElement>('input[aria-label="Zoom, %"]')!;
  await act(async () => field.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '250');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(field.value).toBe('250');
  await act(async () =>
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(close).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
  expect(field.value).toBe('100');
  await act(async () => field.blur());
  expect(change).not.toHaveBeenCalled();
  const action = host.querySelector<HTMLButtonElement>('[aria-label="Center image"]')!;
  await act(async () =>
    action.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(close).toHaveBeenCalledOnce();
});

it('shows saved click and keyboard provenance without inventing missing geometry', async () => {
  const source = {
    kind: 'video-frame' as const,
    recordingId: 'recording',
    filename: 'video',
    timeSeconds: 1,
    action: {
      id: 'event',
      kind: 'CLICK' as const,
      time: 1,
      duration: 0.5,
      label: 'Open',
      point: { x: 0.25, y: 0.5 },
      target: { name: 'Open', tag: 'button', role: '' },
    },
  };
  await render(null, false, { ...block, source });
  expect(host.textContent).toContain('Point: 25% × 50%');
  expect(host.textContent).toContain('button');
  await render(null, false, {
    ...block,
    source: { ...source, action: { ...source.action, kind: 'KEY', target: null, point: null } },
  });
  expect(host.textContent).toContain('Keystroke');
  expect(host.textContent).not.toContain('Point:');
});

it('makes editing and replacing the selected image available from its inspector', async () => {
  await render();
  const buttons = [...host.querySelectorAll('button')].map(
    (button) => button.getAttribute('aria-label') ?? button.textContent?.trim()
  );
  expect(buttons).toContain('Edit image');
  expect(buttons).toContain('Replace image');
  await click('Edit image');
  expect(edit).toHaveBeenCalledOnce();
  await click('Replace image');
  expect(requestResource).toHaveBeenCalledWith({
    kind: 'replace-image',
    stepId: 'step',
    blockId: block.id,
  });
});

it('does not edit an unavailable or disabled image', async () => {
  await render(null);
  await click('Edit image');
  expect(edit).not.toHaveBeenCalled();
  await render('blob:image', true);
  await click('Edit image');
  expect(edit).not.toHaveBeenCalled();
  await click('Replace image');
  expect(requestResource).not.toHaveBeenCalled();
});
