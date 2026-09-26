// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { acquireFrozenSelectionFrame } from './frozen-acquisition';

vi.mock('./frozen', () => ({
  captureFrozenSelectionGeometry: () => ({
    width: 1024,
    height: 768,
    scale: 1,
    getRect: vi.fn(),
    targetAt: vi.fn(),
    assertViewport: vi.fn(),
  }),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function fixture() {
  const menu = document.createElement('div');
  document.body.append(menu);
  let resolve: (value: string) => void = () => undefined;
  const response = new Promise<string>((finish) => {
    resolve = finish;
  });
  const frame = acquireFrozenSelectionFrame(() => response);
  return { menu, frame, resolve };
}

it.each(['remove', 'scroll', 'resize', 'style'] as const)(
  'rejects %s changes during a deferred capture',
  async (change) => {
    const { menu, frame, resolve } = fixture();
    const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
    if (change === 'remove') menu.remove();
    if (change === 'scroll') window.dispatchEvent(new Event('scroll'));
    if (change === 'resize') window.dispatchEvent(new Event('resize'));
    if (change === 'style') menu.style.opacity = '0';
    resolve('data:image/png;base64,frame');
    await rejected;
  }
);

it('rejects layout movement without a mutation record while the capture is pending', async () => {
  const { menu, frame, resolve } = fixture();
  vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 200, 10, 20));
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('allows the source page to change after a stable acquisition', async () => {
  const { menu, frame, resolve } = fixture();
  resolve('data:image/png;base64,frame');
  const result = await frame;
  menu.remove();
  window.dispatchEvent(new Event('scroll'));
  expect(result.dataUrl).toBe('data:image/png;base64,frame');
  result.geometry.assertViewport();
});

it('watches mutations inside an accessible iframe and open shadow root', async () => {
  for (const kind of ['iframe', 'shadow']) {
    const host = document.createElement(kind === 'iframe' ? 'iframe' : 'div');
    document.body.append(host);
    const target =
      host instanceof HTMLIFrameElement
        ? host.contentDocument!.body
        : host.attachShadow({ mode: 'open' });
    const { frame, resolve } = fixture();
    const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
    target.append(document.createElement('button'));
    resolve('data:image/png;base64,frame');
    await rejected;
    host.remove();
  }
});

it('releases listeners when capture fails so a later stable capture succeeds', async () => {
  await expect(
    acquireFrozenSelectionFrame(async () => {
      throw new Error('failed');
    })
  ).rejects.toThrow('failed');
  window.dispatchEvent(new Event('scroll'));
  await expect(acquireFrozenSelectionFrame(async () => 'next')).resolves.toMatchObject({
    dataUrl: 'next',
  });
});
