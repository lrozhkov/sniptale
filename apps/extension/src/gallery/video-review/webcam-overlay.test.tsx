// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewWebcamOverlay } from './webcam-overlay';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
const io = vi.hoisted(() => ({ mount: vi.fn(() => vi.fn()), area: vi.fn() }));
vi.mock('./webcam-preview', () => ({ mountReviewWebcamPreview: io.mount }));
vi.mock('./focus-area', () => ({
  ReviewFocusArea: (props: unknown) => {
    io.area(props);
    return <button>handle</button>;
  },
}));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('retains manual camera controls and forwards their draft without a hybrid decoder or canvas', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  cleanup = () => act(() => root.unmount());
  const settings = createQuickEditWebcam(
    'camera',
    { width: 100, height: 100 },
    { width: 800, height: 450 }
  );
  const preview = vi.fn();
  const place = vi.fn();
  const binding: Parameters<typeof ReviewWebcamOverlay>[0]['binding'] = {
    settings,
    disabled: false,
    editor: {
      crop: { zoom: 1, panX: 0, panY: 0 },
      place,
      placement: settings.placement,
      resourceAttempt: 0,
      retry: vi.fn(),
      selectVisible: vi.fn(),
      selection: { kind: 'webcam' },
      time: 1,
    },
  };
  const main = createRef<HTMLVideoElement>();
  main.current = document.createElement('video');
  await act(async () =>
    root.render(
      <ReviewWebcamOverlay
        binding={binding}
        main={main}
        output={{ width: 800, height: 450 }}
        manual={{ phase: 'ready', duration: 10, ready: true, onPreviewPlacement: preview }}
      />
    )
  );
  expect(io.mount).not.toHaveBeenCalled();
  expect(host.querySelector('canvas')).toBeNull();
  expect(host.querySelector('button')?.textContent).toBe('handle');
  const area = io.area.mock.lastCall![0] as {
    onPreview(value: typeof settings.placement | null): void;
    onChange(value: typeof settings.placement): void;
  };
  const draft = { ...settings.placement, x: 0.2 };
  act(() => area.onPreview(draft));
  expect(preview).toHaveBeenLastCalledWith(draft);
  act(() => area.onChange(draft));
  expect(place).toHaveBeenCalledExactlyOnceWith(draft);
  act(() => area.onPreview(null));
  expect(preview).toHaveBeenLastCalledWith(null);
});

it('clears a drag draft through the independent callback after detailed mode switches to hybrid', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  cleanup = () => act(() => root.unmount());
  const settings = createQuickEditWebcam(
    'camera',
    { width: 100, height: 100 },
    { width: 800, height: 450 }
  );
  const onPreviewPlacement = vi.fn();
  const binding: Parameters<typeof ReviewWebcamOverlay>[0]['binding'] = {
    settings,
    disabled: false,
    editor: {
      crop: { zoom: 1, panX: 0, panY: 0 },
      place: vi.fn(),
      placement: settings.placement,
      resourceAttempt: 0,
      retry: vi.fn(),
      selectVisible: vi.fn(),
      selection: { kind: 'webcam' },
      time: 1,
    },
  };
  const main = createRef<HTMLVideoElement>();
  main.current = document.createElement('video');
  const render = async (manual: boolean) =>
    act(async () =>
      root.render(
        <ReviewWebcamOverlay
          binding={binding}
          main={main}
          output={{ width: 800, height: 450 }}
          onPreviewPlacement={onPreviewPlacement}
          {...(manual
            ? {
                manual: {
                  phase: 'ready' as const,
                  duration: 10,
                  ready: true,
                  onPreviewPlacement: vi.fn(),
                },
              }
            : {})}
        />
      )
    );
  await render(true);
  const first = io.area.mock.lastCall![0] as {
    onPreview(value: typeof settings.placement | null): void;
  };
  act(() => first.onPreview({ ...settings.placement, x: 0.2 }));
  await render(false);
  // The active gesture's callback survives removal of the manual resource binding.
  act(() => first.onPreview(null));
  expect(onPreviewPlacement).toHaveBeenLastCalledWith(null);
  expect(io.mount).toHaveBeenCalledOnce();
});
