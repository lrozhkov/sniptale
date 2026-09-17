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
  expect(change).toHaveBeenLastCalledWith({
    layout: { padding: 60, cornerRadius: 24 },
  });
  // None disables the whole canvas background.
  await act(async () => buttons[0]!.click());
  expect(change).toHaveBeenLastCalledWith({ enabled: false });
});
