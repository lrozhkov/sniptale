// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBrowserAnnotationTargetEvidence } from '../../parser/page-preparation/annotations';
import { captureReviewPreview } from './preview';
import type { ReviewSessionEntry } from './controller';

const effects = vi.hoisted(() => ({
  attach: vi.fn(),
  send: vi.fn(),
  crop: vi.fn(),
  position: vi.fn(),
  shadow: vi.fn(),
  draw: vi.fn(),
}));
vi.mock('../runtime-services/services', () => ({
  getContentRuntimeServices: () => ({
    contentActionIntent: { attachContentActionIntent: effects.attach },
    messaging: { sendRuntimeMessage: effects.send },
  }),
}));
vi.mock('@sniptale/platform/browser/media/image-crop', () => ({ cropImage: effects.crop }));
vi.mock('../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/frame')>()),
  getAbsolutePosition: effects.position,
}));
vi.mock('../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/dom-host')>()),
  resolveContentShadowRoot: effects.shadow,
}));

const source = { kind: 'trusted-content-event' } as const;
const contextDescriptor = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext'
)!;
let imageWidth = 2048;
let imageHeight = 1024;
let decode = vi.fn<() => Promise<void>>();
let host: HTMLElement;
let target: HTMLElement;
let entry: ReviewSessionEntry;
const resolve = vi.fn<(record: ReviewSessionEntry['record']) => Element | null>();

beforeEach(() => {
  vi.clearAllMocks();
  imageWidth = 2048;
  imageHeight = 1024;
  decode = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      width = imageWidth;
      height = imageHeight;
      decode = decode;
    }
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    })
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({ drawImage: effects.draw })),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,cHJldmlldw=='
  );
  host = document.createElement('aside');
  document.body.append(host);
  effects.shadow.mockReturnValue(host.attachShadow({ mode: 'open' }));
  target = document.createElement('button');
  target.textContent = 'Review this';
  document.body.append(target);
  effects.position.mockReturnValue({ x: 20, y: 30, width: 100, height: 50 });
  entry = {
    id: crypto.randomUUID(),
    unavailable: false,
    record: {
      annotationId: 1,
      creationOrder: 1,
      comment: 'Note',
      propertyChanges: [],
      evidence: createBrowserAnnotationTargetEvidence(target),
    },
  };
  effects.position.mockClear();
  resolve.mockReturnValue(target);
  effects.position.mockReturnValue({ x: 20, y: 30, width: 100, height: 50 });
  effects.attach.mockResolvedValue({
    type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
    contentIntent: { token: 'authority' },
  });
  effects.send.mockResolvedValue({ success: true, dataUrl: 'data:image/png;base64,c2NyZWVu' });
  effects.crop.mockResolvedValue('data:image/png;base64,Y3JvcA==');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', contextDescriptor);
  document.body.replaceChildren();
});

it('acquires user authority before frames, hides the overlay during capture, and restores exact opacity', async () => {
  host.style.setProperty('opacity', '0.4', 'important');
  let authorize:
    | ((message: { type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP }) => void)
    | undefined;
  effects.attach.mockImplementationOnce(
    () =>
      new Promise((done) => {
        authorize = done;
      })
  );
  effects.send.mockImplementationOnce(async () => {
    expect(host.style.getPropertyValue('opacity')).toBe('0');
    expect(host.style.getPropertyPriority('opacity')).toBe('important');
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    return { success: true, dataUrl: 'screen' };
  });
  const pending = captureReviewPreview(entry, source, resolve);
  expect(effects.attach).toHaveBeenCalledExactlyOnceWith(
    { type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP },
    source
  );
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  expect(effects.send).not.toHaveBeenCalled();
  expect(host.style.opacity).toBe('0.4');
  authorize?.({ type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP });
  expect(await pending).toEqual({
    dataUrl: 'data:image/png;base64,cHJldmlldw==',
    width: 1024,
    height: 512,
  });
  expect(effects.send).toHaveBeenCalledExactlyOnceWith({
    type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
  });
  expect(effects.crop).toHaveBeenCalledWith('screen', { x: 4, y: 14, width: 132, height: 82 });
  expect(effects.draw).toHaveBeenCalledWith(
    expect.objectContaining({ src: 'data:image/png;base64,Y3JvcA==' }),
    0,
    0,
    1024,
    512
  );
  expect(host.style.getPropertyValue('opacity')).toBe('0.4');
  expect(host.style.getPropertyPriority('opacity')).toBe('important');
});
it('clips crop padding to viewport edges and keeps small previews at original size', async () => {
  effects.position.mockReturnValue({
    x: 2,
    y: 3,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  imageWidth = 80;
  imageHeight = 40;
  expect(await captureReviewPreview(entry, source, resolve)).toMatchObject({
    width: 80,
    height: 40,
  });
  expect(effects.crop).toHaveBeenCalledWith(expect.any(String), {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  expect(host.style.getPropertyValue('opacity')).toBe('');
});
it('limits tall previews while retaining a nonzero width', async () => {
  imageWidth = 1;
  imageHeight = 4096;
  expect(await captureReviewPreview(entry, source, resolve)).toMatchObject({
    width: 1,
    height: 512,
  });
});
it.each([
  { x: -100, y: 20, width: 10, height: 20 },
  { x: 20, y: -100, width: 10, height: 20 },
  { x: 2000, y: 20, width: 10, height: 20 },
  { x: 20, y: 2000, width: 10, height: 20 },
])('refuses an offscreen target without requesting capture authority: %o', async (box) => {
  effects.position.mockReturnValue(box);
  expect(await captureReviewPreview(entry, source, resolve)).toBeNull();
  expect(effects.attach).not.toHaveBeenCalled();
  expect(effects.send).not.toHaveBeenCalled();
});
it('refuses an unresolved target without accessing runtime services', async () => {
  resolve.mockReturnValue(null);
  expect(await captureReviewPreview(entry, source, resolve)).toBeNull();
  expect(effects.position).not.toHaveBeenCalled();
  expect(effects.attach).not.toHaveBeenCalled();
});
it.each(['capture refusal', 'missing image', 'detached target', 'changed page'])(
  'restores the overlay and preserves saved evidence after %s',
  async (failure) => {
    const before = structuredClone(entry);
    effects.send.mockImplementationOnce(async () => {
      if (failure === 'detached target') target.remove();
      if (failure === 'changed page') entry.record.evidence.pageUrl = 'https://other.test/';
      return {
        success: failure !== 'capture refusal',
        ...(failure === 'missing image' ? {} : { dataUrl: 'screen' }),
      };
    });
    expect(await captureReviewPreview(entry, source, resolve)).toBeNull();
    expect(effects.crop).not.toHaveBeenCalled();
    expect(host.style.getPropertyValue('opacity')).toBe('');
    expect(entry.record.comment).toBe(before.record.comment);
    expect(entry.preview).toBeUndefined();
  }
);
it.each(['x', 'y', 'width', 'height'] as const)(
  'refuses a preview when target %s drifts beyond one CSS pixel',
  async (dimension) => {
    const initial = { x: 20, y: 30, width: 100, height: 50 };
    effects.position
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce({ ...initial, [dimension]: initial[dimension] + 1.01 });
    expect(await captureReviewPreview(entry, source, resolve)).toBeNull();
    expect(effects.crop).not.toHaveBeenCalled();
    expect(host.style.opacity).toBe('');
  }
);
it('accepts target drift within one CSS pixel', async () => {
  effects.position
    .mockReturnValueOnce({ x: 20, y: 30, width: 100, height: 50 })
    .mockReturnValueOnce({ x: 21, y: 29, width: 101, height: 49 });
  expect(await captureReviewPreview(entry, source, resolve)).toMatchObject({
    width: 1024,
    height: 512,
  });
});
it.each(['send', 'crop', 'decode'] as const)(
  'restores overlay opacity when %s throws',
  async (stage) => {
    host.style.opacity = '0.7';
    const error = new Error('Capture failed');
    if (stage === 'send') effects.send.mockRejectedValueOnce(error);
    if (stage === 'crop') effects.crop.mockRejectedValueOnce(error);
    if (stage === 'decode') decode.mockRejectedValueOnce(error);
    await expect(captureReviewPreview(entry, source, resolve)).rejects.toThrow('Capture failed');
    expect(host.style.opacity).toBe('0.7');
  }
);
it('preserves a newer overlay opacity set during capture', async () => {
  effects.send.mockImplementationOnce(async () => {
    host.style.opacity = '0.8';
    return { success: false };
  });
  expect(await captureReviewPreview(entry, source, resolve)).toBeNull();
  expect(host.style.opacity).toBe('0.8');
});
it('leaves the overlay untouched if authority is refused', async () => {
  host.style.opacity = '0.6';
  effects.attach.mockRejectedValueOnce(new Error('No authority'));
  await expect(captureReviewPreview(entry, source, resolve)).rejects.toThrow('No authority');
  expect(host.style.opacity).toBe('0.6');
  expect(effects.send).not.toHaveBeenCalled();
});
it('supports a missing overlay and returns no preview when a canvas context is unavailable', async () => {
  effects.shadow.mockReturnValue(null);
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => null,
  });
  expect(await captureReviewPreview(entry, source, resolve)).toBeNull();
  expect(effects.draw).not.toHaveBeenCalled();
});
