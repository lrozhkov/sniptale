// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EMBEDDED_CAMERA_GEOMETRY } from './geometry';
import { EmbeddedRecordingCamera } from './view';
import { useEmbeddedCameraPeer } from './peer';

vi.mock('./peer', () => ({ useEmbeddedCameraPeer: vi.fn(() => null) }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function pointer(type: string, init: PointerEventInit) {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

it('does not render while disabled', () => {
  act(() => root.render(<EmbeddedRecordingCamera enabled={false} interactive={true} />));
  expect(host.firstElementChild).toBeNull();
});

it.each(['circle', 'rectangle'] as const)(
  'exposes one unclipped resize control for %s',
  (shape) => {
    act(() =>
      root.render(
        <EmbeddedRecordingCamera
          enabled={true}
          interactive={true}
          geometry={{ ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY, shape }}
        />
      )
    );
    const camera = host.firstElementChild as HTMLElement;
    expect(camera.querySelectorAll('[data-resize="true"]')).toHaveLength(1);
    expect(camera.style.overflow).not.toBe('hidden');
    expect((camera.firstElementChild as HTMLElement).style.overflow).toBe('hidden');
    expect(camera.querySelector('button')?.getAttribute('aria-label')).not.toBe('Camera');
    const handle = camera.querySelector<HTMLElement>('[data-resize="true"]')!;
    expect(handle.style.cursor).toBe('grab');
    expect(handle.querySelector('svg')?.style.cursor).toBe('inherit');
    expect(handle.querySelector('svg')?.style.pointerEvents).toBe('none');
    expect(handle.className).not.toContain('group-focus-within:opacity-100');
    expect(handle.className).toContain('focus-visible:opacity-100');
  }
);

it('does not expose resize controls when camera interaction is disabled', () => {
  act(() => root.render(<EmbeddedRecordingCamera enabled={true} interactive={false} />));
  expect(host.querySelector('button')).toBeNull();
});

it('keeps peer callbacks stable across preview and geometry rerenders', () => {
  const onOffer = vi.fn(async () => 'answer');
  const onPeerClose = vi.fn();
  act(() =>
    root.render(
      <EmbeddedRecordingCamera
        enabled
        geometry={DEFAULT_EMBEDDED_CAMERA_GEOMETRY}
        interactive
        onOffer={onOffer}
        onPeerClose={onPeerClose}
      />
    )
  );
  const first = vi.mocked(useEmbeddedCameraPeer).mock.calls.at(-1)?.[0];
  act(() =>
    root.render(
      <EmbeddedRecordingCamera
        enabled
        geometry={{ ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY, center: { x: 0.7, y: 0.7 } }}
        interactive
        onOffer={onOffer}
        onPeerClose={onPeerClose}
      />
    )
  );
  const second = vi.mocked(useEmbeddedCameraPeer).mock.calls.at(-1)?.[0];
  expect(second?.onError).toBe(first?.onError);
  expect(second?.onOffer).toBe(first?.onOffer);
  expect(second?.onPeerClose).toBe(first?.onPeerClose);
});

it('drags from the camera surface after the threshold and commits normalized geometry', () => {
  const onGeometryChange = vi.fn();
  act(() =>
    root.render(
      <EmbeddedRecordingCamera
        enabled={true}
        geometry={DEFAULT_EMBEDDED_CAMERA_GEOMETRY}
        interactive={true}
        onGeometryChange={onGeometryChange}
      />
    )
  );
  const camera = host.querySelector<HTMLElement>(
    '[data-ui="content.video-recording.embedded-camera"]'
  )!;
  expect(camera.style.cursor).toBe('grab');
  act(() => {
    camera.dispatchEvent(pointer('pointerdown', { clientX: 800, clientY: 600 }));
    camera.dispatchEvent(pointer('pointermove', { clientX: 900, clientY: 650 }));
  });
  expect(camera.style.cursor).toBe('grabbing');
  act(() => {
    camera.dispatchEvent(pointer('pointerup', { clientX: 900, clientY: 650 }));
  });
  expect(camera.style.cursor).toBe('grab');
  expect(onGeometryChange).toHaveBeenCalledWith(
    expect.objectContaining({ center: expect.objectContaining({ x: expect.any(Number) }) })
  );
});

it('resizes from a corner with a locked aspect ratio and disables page interaction', () => {
  const onGeometryChange = vi.fn();
  act(() =>
    root.render(
      <EmbeddedRecordingCamera
        enabled={true}
        geometry={{ ...DEFAULT_EMBEDDED_CAMERA_GEOMETRY, shape: 'rectangle' }}
        interactive={true}
        onGeometryChange={onGeometryChange}
      />
    )
  );
  const camera = host.firstElementChild as HTMLElement;
  const handle = camera.querySelector<HTMLElement>('[data-corner="nw"]')!;
  act(() => {
    handle
      .querySelector('svg')!
      .dispatchEvent(pointer('pointerdown', { clientX: 700, clientY: 500 }));
  });
  expect(handle.style.cursor).toBe('grabbing');
  expect(camera.style.cursor).toBe('grabbing');
  act(() => {
    camera.dispatchEvent(pointer('pointermove', { clientX: 780, clientY: 580 }));
  });
  expect(handle.style.cursor).toBe('grabbing');
  act(() => {
    camera.dispatchEvent(pointer('pointerup', { clientX: 780, clientY: 580 }));
  });
  expect(handle.style.cursor).toBe('grab');
  expect(camera.style.cursor).toBe('grab');
  expect(onGeometryChange).toHaveBeenCalledWith(
    expect.objectContaining({ shape: 'rectangle', sizeFraction: expect.any(Number) })
  );

  act(() =>
    root.render(
      <EmbeddedRecordingCamera enabled={true} interactive={false} onGeometryChange={vi.fn()} />
    )
  );
  expect((host.firstElementChild as HTMLElement).style.pointerEvents).toBe('none');
});

it('restores camera geometry if the resize command fails', async () => {
  const onGeometryChange = vi.fn(async () => {
    throw new Error('Resize refused');
  });
  act(() =>
    root.render(
      <EmbeddedRecordingCamera
        enabled={true}
        interactive={true}
        onGeometryChange={onGeometryChange}
      />
    )
  );
  const camera = host.firstElementChild as HTMLElement;
  const width = camera.style.width;
  const handle = camera.querySelector('[data-resize="true"] svg')!;
  act(() => {
    handle.dispatchEvent(pointer('pointerdown', { clientX: 700, clientY: 500 }));
    camera.dispatchEvent(pointer('pointermove', { clientX: 780, clientY: 580 }));
  });
  expect(camera.style.width).not.toBe(width);
  await act(async () => {
    camera.dispatchEvent(pointer('pointerup', { clientX: 780, clientY: 580 }));
  });
  expect(onGeometryChange).toHaveBeenCalledOnce();
  expect(camera.style.width).toBe(width);
});

it.each(['nw', 'ne', 'sw', 'se'] as const)(
  'docks to %s and keeps the inward resize handle after viewport resize',
  (corner) => {
    const onGeometryChange = vi.fn();
    act(() =>
      root.render(
        <EmbeddedRecordingCamera enabled interactive onGeometryChange={onGeometryChange} />
      )
    );
    const camera = host.firstElementChild as HTMLElement;
    const startX = Number.parseFloat(camera.style.left);
    const startY = Number.parseFloat(camera.style.top);
    const x = corner.includes('w') ? 100 : 900;
    const y = corner.includes('n') ? 100 : 700;
    act(() => camera.dispatchEvent(pointer('pointerdown', { clientX: startX, clientY: startY })));
    expect(Number.parseFloat(camera.style.left)).toBe(startX);
    expect(Number.parseFloat(camera.style.top)).toBe(startY);
    expect(host.querySelectorAll('[data-ui^="content.video-recording.camera-dock."]')).toHaveLength(
      12
    );
    const guide = host.querySelector<HTMLElement>(
      '[data-ui="content.video-recording.camera-dock.nw"]'
    )!;
    expect(guide.style.width).toBe('64px');
    expect(guide.style.height).toBe('64px');
    expect(guide.getAttribute('style')).toContain('--sniptale-color-surface-contrast');
    expect(guide.getAttribute('style')).not.toContain('--sniptale-color-accent');
    act(() => camera.dispatchEvent(pointer('pointermove', { clientX: x, clientY: y })));
    expect(
      host
        .querySelector(`[data-ui="content.video-recording.camera-dock.${corner}"]`)
        ?.getAttribute('data-active')
    ).toBe('true');
    act(() => camera.dispatchEvent(pointer('pointerup', { clientX: x, clientY: y })));
    expect(host.querySelector('[data-ui="content.video-recording.camera-dock-guides"]')).toBeNull();
    expect(onGeometryChange).toHaveBeenCalledOnce();
    const opposite =
      corner === 'nw' ? 'se' : corner === 'ne' ? 'sw' : corner === 'sw' ? 'ne' : 'nw';
    expect(camera.querySelector('[data-resize]')?.getAttribute('data-corner')).toBe(opposite);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    act(() => window.dispatchEvent(new Event('resize')));
    const width = Number.parseFloat(camera.style.width);
    expect(Number.parseFloat(camera.style.left)).toBeCloseTo(
      corner.includes('w') ? 12 + width / 2 : 1200 - 12 - width / 2
    );
  }
);

it('cancels a dock gesture without saving and keeps a 12px nonblocking hover perimeter', () => {
  const onGeometryChange = vi.fn();
  act(() =>
    root.render(<EmbeddedRecordingCamera enabled interactive onGeometryChange={onGeometryChange} />)
  );
  const camera = host.firstElementChild as HTMLElement;
  const left = camera.style.left;
  vi.spyOn(camera, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 176, 176));
  const handle = camera.querySelector<HTMLElement>('[data-resize]')!;
  act(() => document.dispatchEvent(pointer('pointermove', { clientX: 89, clientY: 120 })));
  expect(handle.classList.contains('opacity-100')).toBe(true);
  act(() => document.dispatchEvent(pointer('pointermove', { clientX: 87, clientY: 120 })));
  expect(handle.classList.contains('opacity-0')).toBe(true);
  act(() => {
    camera.dispatchEvent(pointer('pointerdown', { clientX: 900, clientY: 700 }));
    camera.dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
    camera.dispatchEvent(pointer('pointercancel', {}));
  });
  expect(camera.style.left).toBe(left);
  expect(onGeometryChange).not.toHaveBeenCalled();
  expect(host.querySelector('[data-ui="content.video-recording.camera-dock-guides"]')).toBeNull();
});

it('does not let a delayed rejected move overwrite a newer placement', async () => {
  let refuse!: (error: Error) => void;
  const onGeometryChange = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          refuse = reject;
        })
    )
    .mockResolvedValueOnce(undefined);
  act(() =>
    root.render(<EmbeddedRecordingCamera enabled interactive onGeometryChange={onGeometryChange} />)
  );
  const camera = host.firstElementChild as HTMLElement;
  const dragTo = (x: number, y: number) =>
    act(() => {
      camera.dispatchEvent(
        pointer('pointerdown', {
          clientX: Number.parseFloat(camera.style.left),
          clientY: Number.parseFloat(camera.style.top),
        })
      );
      camera.dispatchEvent(pointer('pointermove', { clientX: x, clientY: y }));
      camera.dispatchEvent(pointer('pointerup', { clientX: x, clientY: y }));
    });
  dragTo(100, 100);
  dragTo(900, 100);
  const latest = camera.style.left;
  await act(async () => refuse(new Error('Previous move refused')));
  expect(camera.style.left).toBe(latest);
  expect(onGeometryChange).toHaveBeenCalledTimes(2);
});
