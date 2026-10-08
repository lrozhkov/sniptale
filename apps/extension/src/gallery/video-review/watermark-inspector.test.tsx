// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ReviewWatermarkInspector,
  type ReviewWatermarkInspectorProps,
} from './watermark-inspector';
import { createQuickEditWatermark } from '../../features/video/review/advanced/watermark';

const io = vi.hoisted(() => ({ picker: vi.fn() }));
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
vi.mock('../../composition/background-resources/picker', () => ({
  BackgroundImagePicker: (props: unknown) => {
    io.picker(props);
    return null;
  },
}));
vi.mock('../../workflows/background-images/static-logo', () => ({
  prepareStaticLogo: vi.fn(),
  StaticLogoError: class extends Error {},
}));
let root: Root;
let host: HTMLDivElement;
let props: ReviewWatermarkInspectorProps;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  props = {
    settings: { ...createQuickEditWatermark('Saved text'), mode: 'text' },
    output: { width: 1920, height: 1080 },
    onChange: vi.fn(async () => true),
    onPreview: vi.fn(),
    onImage: vi.fn(async () => undefined),
    pending: false,
    error: null,
    onError: vi.fn(),
    onReset: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<ReviewWatermarkInspector {...props} />));
}
async function type(value: string) {
  const node = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return node;
}

it('previews text locally and commits Enter plus blur exactly once', async () => {
  await render();
  const node = await type('Draft\nАвтор');
  expect(props.onChange).not.toHaveBeenCalled();
  expect(props.onPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({ text: expect.objectContaining({ value: 'Draft\nАвтор' }) })
  );
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  act(() => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onChange).toHaveBeenCalledTimes(1);
});

it('cancels the text draft on Escape without a blur commit and ignores IME Enter', async () => {
  await render();
  const node = await type('Discard me');
  act(() =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })
    )
  );
  expect(props.onChange).not.toHaveBeenCalled();
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onChange).not.toHaveBeenCalled();
  expect(node.value).toBe('Saved text');
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
});

it('keeps over-limit text visible with validation and never silently truncates or commits it', async () => {
  await render();
  const text = '🙂'.repeat(201);
  const node = await type(text);
  act(() => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(node.value).toBe(text);
  expect(props.onChange).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('watermarkTextInvalid');
});

it('hides irrelevant placement controls for tiled mode and forwards reset as one action', async () => {
  props.settings = { ...props.settings!, layout: 'tiled' };
  await render();
  expect(host.querySelector('[data-ui="watermark.anchors"]')).toBeNull();
  expect(host.textContent).toContain('watermarkSpacing');
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.watermarkReset"]')!
      .click()
  );
  expect(props.onReset).toHaveBeenCalledTimes(1);
  expect(props.onChange).not.toHaveBeenCalled();
});

it('uses the bounded static acquisition policy, retains the thumbnail and exposes retry errors', async () => {
  props.settings = {
    ...props.settings!,
    mode: 'image',
    image: { assetId: 'project-asset:logo', width: 10, height: 10, size: 0.2, opacity: 1 },
  };
  props.imagePreviewUrl = 'blob:owned-preview';
  props.error = 'Retry upload';
  props.onRetry = vi.fn(async () => undefined);
  await render();
  expect(io.picker).toHaveBeenLastCalledWith(
    expect.objectContaining({ showPresets: false, prepareImage: expect.any(Function) })
  );
  expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:owned-preview');
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.watermarkRetry"]')!
      .click()
  );
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  expect(props.onImage).not.toHaveBeenCalled();
});

it('previews numeric text size without committing until acceptance', async () => {
  await render();
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.videoReview.watermarkSize"]'
  )!;
  act(() => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '48');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(props.onChange).not.toHaveBeenCalled();
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(props.onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ text: expect.objectContaining({ size: 48 / 1080 }) })
  );
});

it('clears custom coordinates when choosing any of the nine anchors', async () => {
  props.settings = {
    ...props.settings!,
    placement: { anchor: 'center', margin: 0.02, position: { x: 0.7, y: 0.3 } },
  };
  await render();
  const buttons = host.querySelectorAll<HTMLButtonElement>('[data-ui="watermark.anchors"] button');
  expect(buttons).toHaveLength(9);
  act(() => buttons[0]!.click());
  expect(props.onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ placement: { anchor: 'top-left', margin: 0.02 } })
  );
});

it('keeps canvas preview separate from authored text until Enter and blur commit once', async () => {
  function ControlledInspector() {
    const [preview, setPreview] = useState<ReviewWatermarkInspectorProps['settings']>(undefined);
    return (
      <>
        <output>{preview?.text.value}</output>
        <ReviewWatermarkInspector
          {...props}
          onPreview={(settings) => {
            props.onPreview(settings);
            setPreview(settings ?? undefined);
          }}
        />
      </>
    );
  }
  await act(async () => root.render(<ControlledInspector />));
  const node = await type('Canvas draft');
  expect(host.querySelector('output')?.textContent).toBe('Canvas draft');
  expect(props.settings?.text.value).toBe('Saved text');
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  act(() => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      text: expect.objectContaining({ value: 'Canvas draft' }),
    })
  );
});

it('previews logo opacity and accepts one normalized opacity without changing its asset', async () => {
  const image = { assetId: 'project-asset:logo', width: 200, height: 100, size: 0.2, opacity: 1 };
  props.settings = { ...props.settings!, mode: 'image', image };
  await render();
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.videoReview.watermarkOpacity"]'
  )!;
  act(() => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '35');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(props.onChange).not.toHaveBeenCalled();
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(props.onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      image: { ...image, opacity: 0.35 },
    })
  );
});

it('keeps image acquisition cancellation and admission errors with the picker owner', async () => {
  props.settings = { ...props.settings!, mode: 'image' };
  await render();
  const picker = io.picker.mock.lastCall![0] as {
    onSelect(value: { file: File; originMediaId: string }, signal: AbortSignal): Promise<void>;
    onError(error: unknown): void;
  };
  const file = new File(['logo'], 'logo.png', { type: 'image/png' });
  const controller = new AbortController();
  await act(async () =>
    picker.onSelect({ file, originMediaId: 'library:logo' }, controller.signal)
  );
  expect(props.onImage).toHaveBeenCalledExactlyOnceWith(file, 'library:logo', controller.signal);
  expect(props.onError).toHaveBeenCalledWith(null);
  act(() => picker.onError(new Error('Untrusted source details')));
  expect(props.onError).toHaveBeenLastCalledWith('gallery.videoReview.watermarkImageFailed');
});

it('retains failed text for an explicit same-draft retry and deduplicates pending Enter plus blur', async () => {
  let settle!: (saved: boolean) => void;
  const save = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        settle = resolve;
      })
  );
  props.onChange = save;
  await render();
  const node = await type('Retry this draft');
  act(() => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    node.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => settle(false));
  // Reload keeps the same authored text when the durable commit failed before writing.
  props.settings = { ...props.settings!, text: { ...props.settings!.text } };
  await render();
  expect(node.value).toBe('Retry this draft');
  act(() => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    node.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      text: expect.objectContaining({ value: 'Retry this draft' }),
    })
  );
  await act(async () => settle(true));
  act(() => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(save).toHaveBeenCalledTimes(2);
});

it('ignores a stale text acknowledgement after external settings replace the pending draft', async () => {
  let settle!: (saved: boolean) => void;
  const save = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        settle = resolve;
      })
  );
  props.onChange = save;
  await render();
  const node = await type('Old pending draft');
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  props.settings = {
    ...props.settings!,
    text: { ...props.settings!.text, value: 'Restored text' },
  };
  await render();
  expect(node.value).toBe('Restored text');
  await act(async () => settle(true));
  act(() => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(save).toHaveBeenCalledTimes(1);
  await type('Old pending draft');
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(save).toHaveBeenCalledTimes(2);
  await act(async () => settle(true));
});

it('commits slider changes when canvas previews are echoed into settings', async () => {
  function Controlled() {
    const [draft, setDraft] = useState<ReviewWatermarkInspectorProps['settings']>(undefined);
    return (
      <ReviewWatermarkInspector
        {...props}
        settings={draft ?? props.settings}
        onPreview={(value) => setDraft(value ?? undefined)}
        onChange={async (settings) => {
          const saved = await props.onChange(settings);
          props.settings = settings;
          return saved;
        }}
      />
    );
  }
  await act(async () => root.render(<Controlled />));
  const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  const before = Number(range.value);
  const after = before + 1;
  act(() =>
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(Number(range.value)).toBeCloseTo(after);
  expect(props.onChange).not.toHaveBeenCalled();
  await act(async () =>
    range.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
  );
  expect(props.onChange).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  await render();
  expect(Number(host.querySelector<HTMLInputElement>('input[type="range"]')!.value)).toBeCloseTo(
    after
  );
});
