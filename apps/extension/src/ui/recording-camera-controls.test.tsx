// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { RecordingCameraControls } from './recording-camera-controls';

vi.mock('../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('offers five icon silhouettes and previews a numeric drag without committing', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const onPreview = vi.fn();
  try {
    await act(async () =>
      root.render(
        <RecordingCameraControls
          presentation={{ ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!, shape: 'square' }}
          onChange={onChange}
          onPreview={onPreview}
        />
      )
    );
    expect(host.querySelector('[data-ui="recording.camera.appearance"]')?.className).not.toMatch(
      /\bpr-4\b/u
    );
    const shapes = host.querySelector(
      '[aria-label="popup.video.webcamPresentationShapeLabel"][role="group"]'
    )!;
    expect(shapes.querySelectorAll('button svg')).toHaveLength(5);
    expect(shapes.querySelector('[aria-haspopup="listbox"]')).toBeNull();
    for (const [field, value, patch] of [
      ['Size', '35', { sizeFraction: 0.35 }],
      ['Zoom', '175', { appearance: expect.objectContaining({ zoom: 1.75 }) }],
      ['Roundness', '24', { appearance: expect.objectContaining({ roundness: 24 }) }],
      ['CropHorizontal', '30', { cropOffset: { x: 0.3 } }],
      ['CropVertical', '-30', { cropOffset: { y: -0.3 } }],
    ] as const) {
      const slider = host.querySelector<HTMLInputElement>(
        `input[aria-label="popup.video.webcamPresentation${field} range"]`
      )!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          slider,
          value
        );
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(onPreview).toHaveBeenLastCalledWith(patch);
    }
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('uses shared switches and keeps acknowledged values until the caller accepts a patch', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    await act(async () =>
      root.render(
        <RecordingCameraControls
          presentation={DEFAULT_VIDEO_SETTINGS.webcamPresentation!}
          onChange={onChange}
        />
      )
    );
    const free = host.querySelector<HTMLButtonElement>(
      '[aria-label="popup.video.webcamFreePlacement"]'
    )!;
    expect(free.className).toContain('sniptale-glass-switch');
    await act(async () => free.click());
    expect(onChange).toHaveBeenLastCalledWith({ freePlacement: true });
    expect(free.getAttribute('aria-checked')).toBe('false');
    for (const [label, key, value] of [
      ['Mirror', 'mirror', true],
      ['Shadow', 'shadow', false],
    ] as const) {
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            `[aria-label="popup.video.webcamPresentation${label}"]`
          )!
          .click()
      );
      expect(onChange).toHaveBeenLastCalledWith({
        appearance: expect.objectContaining({ [key]: value }),
      });
    }
    expect(
      host.querySelector('[data-ui="shared.ui.compact-inspector.color-field"]')
    ).not.toBeNull();
    expect(host.textContent).toContain('popup.video.webcamPresentationZoom');
    for (const [field, patch] of [
      ['Size', { sizeFraction: 0.23 }],
      ['Zoom', { appearance: expect.objectContaining({ zoom: 1.01 }) }],
      ['CropHorizontal', { cropOffset: { x: 0.01 } }],
      ['CropVertical', { cropOffset: { y: 0.01 } }],
    ] as const) {
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            `[aria-label="popup.video.webcamPresentation${field} increase"]`
          )!
          .click()
      );
      expect(onChange).toHaveBeenLastCalledWith(patch);
    }
    await act(async () =>
      root.render(
        <RecordingCameraControls
          presentation={{
            ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
            shape: 'rectangle',
          }}
          onChange={onChange}
        />
      )
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="popup.video.webcamPresentationRoundness increase"]'
        )!
        .click()
    );
    expect(onChange).toHaveBeenLastCalledWith({
      appearance: expect.objectContaining({ roundness: 13 }),
    });
    await act(async () =>
      root.render(
        <RecordingCameraControls
          disabled
          presentation={DEFAULT_VIDEO_SETTINGS.webcamPresentation!}
          onChange={onChange}
        />
      )
    );
    onChange.mockClear();
    await act(async () => free.click());
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
