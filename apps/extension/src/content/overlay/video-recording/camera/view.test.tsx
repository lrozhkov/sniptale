// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EMBEDDED_CAMERA_GEOMETRY } from './geometry';
import { EmbeddedRecordingCamera } from './view';

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
  act(() => {
    camera.dispatchEvent(pointer('pointerdown', { clientX: 800, clientY: 600 }));
    camera.dispatchEvent(pointer('pointermove', { clientX: 900, clientY: 650 }));
    camera.dispatchEvent(pointer('pointerup', { clientX: 900, clientY: 650 }));
  });
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
  const handle = camera.querySelector<HTMLElement>('[data-corner="se"]')!;
  act(() => {
    handle.dispatchEvent(pointer('pointerdown', { clientX: 700, clientY: 500 }));
    camera.dispatchEvent(pointer('pointermove', { clientX: 780, clientY: 580 }));
    camera.dispatchEvent(pointer('pointercancel', { clientX: 780, clientY: 580 }));
  });
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
