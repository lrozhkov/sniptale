// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewBackgroundInspector } from './background-inspector';
import type {
  QuickEditBackgroundSettings,
  QuickEditBackgroundLayout,
} from '../../features/video/review/advanced/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../composition/gradient-preset-resources/use-gradient-preset-catalog', async () => ({
  useGradientPresetCatalog: () => ({
    presets: [
      {
        id: 'preset-1',
        name: 'Dusk',
        gradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { id: 'a', color: '#111318ff', position: 0, midpoint: 0.5 },
            { id: 'b', color: '#2b2f3aff', position: 1, midpoint: 0.5 },
          ],
          interpolation: 'srgb',
          repeat: { enabled: false, span: 1 },
        },
        enabled: true,
        favorite: true,
        order: 1,
      },
    ],
  }),
}));

vi.mock('../../composition/background-resources/catalog', () => ({
  useBackgroundCatalog: () => ({ presets: [], status: 'ready' }),
}));
vi.mock('../../workflows/background-images/intake', () => ({
  BACKGROUND_IMAGE_ACCEPT: 'image/png,image/svg+xml',
  prepareBackgroundImage: async (file: File) => file,
}));
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const layout: QuickEditBackgroundLayout = { padding: 24, cornerRadius: 12 };

it('switches the background kind and commits layout values', async () => {
  const change = vi.fn((_patch: { enabled?: boolean; type?: string }) => undefined);
  const render = (background: QuickEditBackgroundSettings) => {
    act(() => {
      root.render(<ReviewBackgroundInspector background={background} onChange={change} />);
    });
  };
  render({ enabled: false });
  const group = host.querySelector('[aria-label="gallery.videoReview.background"]')!;
  const buttons = [...group.querySelectorAll('button')];
  await act(async () => buttons[1]!.click());
  expect(change).toHaveBeenLastCalledWith({ enabled: true, type: 'solid', color: '#000000ff' });
  render({
    enabled: true,
    type: 'solid',
    color: '#000000ff',
    layout,
  });
  const padding = host.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.backgroundPadding"]'
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(padding, '60');
    padding.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => padding.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(change).toHaveBeenLastCalledWith({
    layout: { padding: 60, cornerRadius: 12 },
  });
  render({
    enabled: true,
    type: 'solid',
    color: '#000000ff',
    layout: { padding: 60, cornerRadius: 12 },
  });

  const corner = host.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.backgroundCornerRadius"]'
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(corner, '24');
    corner.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => corner.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(change).toHaveBeenLastCalledWith({
    layout: { padding: 60, cornerRadius: 24 },
  });
  // None disables the whole canvas background.
  await act(async () => buttons[0]!.click());
  expect(change).toHaveBeenLastCalledWith({ enabled: false });
});

it('offers custom image backgrounds', () => {
  act(() =>
    root.render(<ReviewBackgroundInspector background={{ enabled: false }} onChange={vi.fn()} />)
  );
  expect(host.querySelector('[title="gallery.videoReview.backgroundImage"]')).not.toBeNull();
});

it('opens the image picker and forwards only a selected file', async () => {
  const onImportImage = vi.fn();
  act(() =>
    root.render(
      <ReviewBackgroundInspector
        background={{ enabled: false }}
        onChange={vi.fn()}
        onImportImage={onImportImage}
      />
    )
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[title="gallery.videoReview.backgroundImage"]')!.click()
  );
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  const open = vi.spyOn(input, 'click').mockImplementation(() => undefined);
  await act(async () =>
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('settings.editor.backgrounds.upload'))!
      .click()
  );
  expect(open).toHaveBeenCalledOnce();
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImportImage).not.toHaveBeenCalled();
  const file = new File(['image'], 'background.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImportImage).toHaveBeenCalledWith(file, undefined);
});

it('uses precise layout sliders without limiting typed high-resolution values', async () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <ReviewBackgroundInspector
        background={{ enabled: true, type: 'solid', color: '#000000ff', layout }}
        onChange={change}
      />
    )
  );
  const ranges = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  expect(ranges.map((input) => input.max)).toEqual(['200', '100', '100']);
  for (const [index, key] of ['padding', 'cornerRadius'].entries()) {
    await act(async () => {
      ranges[index]!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        })
      );
      ranges[index]!.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })
      );
    });
    expect(change).toHaveBeenLastCalledWith({
      layout: { ...layout, [key]: (key === 'padding' ? layout.padding : layout.cornerRadius) + 1 },
    });
  }
  await act(async () => {
    ranges[2]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );
    ranges[2]!.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
  });
  expect(change).toHaveBeenLastCalledWith({
    layout: { ...layout, shadow: { intensity: 1, color: '#475569ff' } },
  });
  const padding = host.querySelector<HTMLInputElement>(
    'input[type="text"][aria-label="gallery.videoReview.backgroundPadding"]'
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(padding, '512');
    padding.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => padding.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(change).toHaveBeenLastCalledWith({ layout: { padding: 512, cornerRadius: 12 } });
});

it('offers the fixed legacy default and commits following motion from the background inspector', async () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <ReviewBackgroundInspector
        background={{ enabled: true, type: 'solid', color: '#000000ff', layout }}
        onChange={change}
      />
    )
  );
  const select = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.backgroundZoom"]'
  )!;
  expect(select.textContent).toContain('gallery.videoReview.backgroundZoomFixed');
  await act(async () => select.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent === 'gallery.videoReview.backgroundZoomFollow'
  )!;
  await act(async () => option.click());
  expect(change).toHaveBeenLastCalledWith({ zoomBehavior: 'follow-video' });
  act(() =>
    root.render(<ReviewBackgroundInspector background={{ enabled: false }} onChange={change} />)
  );
  expect(host.querySelector('[aria-label="gallery.videoReview.backgroundZoom"]')).toBeNull();
});

it('restores a saved image when choosing Image without asking for another import', async () => {
  const change = vi.fn();
  const onImportImage = vi.fn();
  act(() =>
    root.render(
      <ReviewBackgroundInspector
        background={{
          enabled: false,
          rememberedImage: { assetId: 'project-asset:custom', imageFit: 'contain' },
        }}
        onChange={change}
        onImportImage={onImportImage}
      />
    )
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[title="gallery.videoReview.backgroundImage"]')!.click()
  );
  expect(change).toHaveBeenCalledExactlyOnceWith({ enabled: true, type: 'image' });
  expect(onImportImage).not.toHaveBeenCalled();
  expect(host.querySelector('input[type="file"]')).not.toBeNull();
});

it('offers blur for images and commits the complete layout using the standard numeric field', async () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <ReviewBackgroundInspector
        background={{
          enabled: true,
          type: 'image',
          assetId: 'test',
          imageFit: 'cover',
          layout: { padding: 40, cornerRadius: 12 },
        }}
        onChange={change}
      />
    )
  );
  const field = host.querySelector<HTMLInputElement>(
    'input[aria-label="editor.scene.backgroundBlurAmount"]'
  )!;
  expect(field.value).toBe('0');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '12');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(change).toHaveBeenLastCalledWith({ layout: { padding: 40, cornerRadius: 12, blur: 12 } });
  act(() =>
    root.render(
      <ReviewBackgroundInspector
        background={{
          enabled: true,
          type: 'solid',
          color: '#000000ff',
          layout: { padding: 40, cornerRadius: 12, blur: 12 },
        }}
        onChange={change}
      />
    )
  );
  expect(host.querySelector('input[aria-label="editor.scene.backgroundBlurAmount"]')).toBeNull();
});
