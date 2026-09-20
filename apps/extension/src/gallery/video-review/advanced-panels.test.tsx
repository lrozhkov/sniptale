// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewAdvancedPanels, ReviewSceneProperties } from './advanced-panels';
import { useReviewZoomEditor } from './zoom-editor';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function Harness() {
  const [advanced, setAdvanced] = useState<QuickEditAdvancedState>(createQuickEditAdvancedState());
  const setBackground = (
    update: (
      background: QuickEditAdvancedState['background']
    ) => QuickEditAdvancedState['background']
  ) => setAdvanced((current) => ({ ...current, background: update(current.background) }));
  const zoom = useReviewZoomEditor({
    setZoom: (update) => setAdvanced((current) => ({ ...current, zoom: update(current.zoom) })),
    zoom: advanced.zoom,
    timelineDuration: 10,
  });
  return (
    <>
      <button
        type="button"
        aria-label="toggleMode"
        onClick={() =>
          setAdvanced((current) => ({
            ...current,
            ui: { ...current.ui, mode: current.ui.mode === 'basic' ? 'advanced' : 'basic' },
          }))
        }
      />
      <button type="button" aria-label="addZoom" onClick={() => zoom.add(3, 10)} />
      {advanced.ui.mode === 'advanced' ? (
        <ReviewSceneProperties
          background={advanced.background}
          busy={false}
          pending={false}
          failed={false}
          onImportImage={vi.fn()}
          setBackground={setBackground}
        />
      ) : null}
      <ReviewAdvancedPanels advanced={advanced} zoom={zoom} />
    </>
  );
}

const button = (key: string) =>
  host.querySelector<HTMLButtonElement>(`[aria-label="${key}"]`) as HTMLButtonElement;

it('edits the background paint and the selected zoom region through the panel callbacks', async () => {
  act(() => root.render(<Harness />));
  expect(host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')).toBeNull();
  await act(async () => button('toggleMode').click());
  expect(host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).toBeNull();

  await act(async () => button('gallery.videoReview.backgroundSolid').click());
  expect(button('gallery.videoReview.backgroundSolid').getAttribute('aria-pressed')).toBe('true');
  expect(button('gallery.videoReview.backgroundNone').getAttribute('aria-pressed')).toBe('false');
  await act(async () => button('gallery.videoReview.backgroundNone').click());
  expect(button('gallery.videoReview.backgroundNone').getAttribute('aria-pressed')).toBe('true');

  await act(async () => button('addZoom').click());
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')).not.toBeNull();
  const focusX = host.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.zoomFocusX"]'
  )!;
  expect(focusX.value).toBe('50');
  setInputValue(focusX, '20');
  await act(async () => {
    focusX.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(focusX.value).toBe('20');
  await act(async () => button('gallery.videoReview.zoomResetPosition').click());
  expect(focusX.value).toBe('50');
  await act(async () => button('gallery.videoReview.zoomDelete').click());
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')).toBeNull();

  await act(async () => button('toggleMode').click());
  expect(host.querySelector('[data-ui="gallery.videoReview.backgroundInspector"]')).toBeNull();
});
