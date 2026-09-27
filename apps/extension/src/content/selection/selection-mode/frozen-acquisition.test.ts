// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { acquireFrozenSelectionFrame } from './frozen-acquisition';
import { captureFrozenSelectionGeometry } from './frozen';

vi.mock('./frozen', () => ({
  captureFrozenSelectionGeometry: vi.fn(() => ({
    width: 1024,
    height: 768,
    scale: 1,
    getRect: vi.fn(),
    targetAt: vi.fn(),
    assertViewport: vi.fn(),
  })),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const menu = document.createElement('div');
  document.body.append(menu);
  vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 50));
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

it('accepts accessibility metadata changes without a visible geometry change', async () => {
  vi.stubGlobal('CSS', { supports: () => true });
  const nativeComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) =>
    pseudoElt ? ({ content: 'none' } as CSSStyleDeclaration) : nativeComputedStyle(element)
  );
  const { menu, frame, resolve } = fixture();
  menu.setAttribute('title', 'updated tooltip');
  menu.setAttribute('aria-label', 'updated accessible label');
  resolve('data:image/png;base64,frame');
  await expect(frame).resolves.toMatchObject({ dataUrl: 'data:image/png;base64,frame' });
});

it('rejects a menu that becomes visible after geometry was captured', async () => {
  const hidden = document.createElement('button');
  hidden.style.display = 'none';
  document.body.append(hidden);
  vi.spyOn(hidden, 'getBoundingClientRect').mockImplementation(() =>
    hidden.style.display === 'none' ? new DOMRect() : new DOMRect(20, 30, 100, 40)
  );
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  hidden.style.display = 'block';
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('retains the captured raster for area-only selection when geometry changes', async () => {
  const menu = document.createElement('div');
  document.body.append(menu);
  vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 50));
  let finish: (dataUrl: string) => void = () => undefined;
  const response = new Promise<string>((next) => {
    finish = next;
  });
  const frame = acquireFrozenSelectionFrame(() => response, { onChanged: 'area-only' });
  menu.style.opacity = '0';
  finish('data:image/png;base64,changed');
  await expect(frame).resolves.toMatchObject({
    areaOnly: true,
    dataUrl: 'data:image/png;base64,changed',
  });
  expect((await frame).geometry.targetAt(20, 30)).toBeNull();
});

it('retains one raster and disables element targeting when SVG sampling exceeds its budget', async () => {
  vi.mocked(captureFrozenSelectionGeometry).mockReturnValueOnce({
    width: 1024,
    height: 768,
    scale: 1,
    areaOnly: true,
    getRect: () => ({ x: 10, y: 20, width: 100, height: 50 }),
    targetAt: () => document.body,
    assertViewport: vi.fn(),
  });
  const capture = vi.fn(async () => 'data:image/png;base64,large-svg');
  const frame = await acquireFrozenSelectionFrame(capture, { onChanged: 'area-only' });
  expect(capture).toHaveBeenCalledOnce();
  expect(frame).toMatchObject({ areaOnly: true, dataUrl: 'data:image/png;base64,large-svg' });
  expect(frame.geometry.targetAt(20, 30)).toBeNull();
});

it('rejects new text that makes an empty element visible', async () => {
  const empty = document.createElement('div');
  document.body.append(empty);
  vi.spyOn(empty, 'getBoundingClientRect').mockImplementation(() =>
    empty.textContent ? new DOMRect(20, 30, 100, 40) : new DOMRect()
  );
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  empty.textContent = 'Loaded menu';
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('rejects metadata changes that reveal a previously hidden element', async () => {
  const hidden = document.createElement('div');
  hidden.setAttribute('aria-expanded', 'false');
  document.body.append(hidden);
  vi.spyOn(hidden, 'getBoundingClientRect').mockImplementation(() =>
    hidden.getAttribute('aria-expanded') === 'true' ? new DOMRect(20, 30, 100, 40) : new DOMRect()
  );
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  hidden.setAttribute('aria-expanded', 'true');
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('rejects a visible trigger attribute that reveals a hidden sibling', async () => {
  const trigger = document.createElement('button');
  const menu = document.createElement('div');
  trigger.setAttribute('aria-expanded', 'false');
  document.body.append(trigger, menu);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 50, 25));
  vi.spyOn(menu, 'getBoundingClientRect').mockImplementation(() =>
    trigger.getAttribute('aria-expanded') === 'true' ? new DOMRect(20, 45, 100, 40) : new DOMRect()
  );
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  trigger.setAttribute('aria-expanded', 'true');
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('rejects a visible descendant added inside a zero-size wrapper', async () => {
  const { frame, resolve } = fixture();
  const wrapper = document.createElement('div');
  const menu = document.createElement('button');
  vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect());
  vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 45, 100, 40));
  wrapper.append(menu);
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  document.body.append(wrapper);
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('does not treat an offscreen insertion as proven stable', async () => {
  const { frame, resolve } = fixture();
  const wrapper = document.createElement('div');
  const item = document.createElement('span');
  vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect());
  vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 2_000, 100, 40));
  wrapper.append(item);
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  document.body.append(wrapper);
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('rejects removal of a visible descendant inside a zero-size wrapper', async () => {
  const wrapper = document.createElement('div');
  const menu = document.createElement('button');
  vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect());
  vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 45, 100, 40));
  wrapper.append(menu);
  document.body.append(wrapper);
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  wrapper.remove();
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('rejects a wrapper class change that reveals a positioned child', async () => {
  const wrapper = document.createElement('div');
  const menu = document.createElement('button');
  vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect());
  vi.spyOn(menu, 'getBoundingClientRect').mockImplementation(() =>
    wrapper.classList.contains('open') ? new DOMRect(20, 45, 100, 40) : new DOMRect()
  );
  wrapper.append(menu);
  document.body.append(wrapper);
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  wrapper.classList.add('open');
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('rejects metadata changes that alter visible generated content', async () => {
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Closed');
  document.body.append(button);
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 100, 40));
  vi.stubGlobal('CSS', { supports: () => true });
  const nativeComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) => {
    if (pseudoElt) {
      return {
        content:
          element === button && pseudoElt === '::before'
            ? button.getAttribute('aria-label')
            : 'none',
      } as CSSStyleDeclaration;
    }
    return nativeComputedStyle(element);
  });
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  button.setAttribute('aria-label', 'Open');
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('rejects metadata changes that alter a visible sibling pseudo-element', async () => {
  const trigger = document.createElement('button');
  const label = document.createElement('div');
  trigger.setAttribute('aria-expanded', 'false');
  document.body.append(trigger, label);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 100, 40));
  vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 60, 100, 40));
  vi.stubGlobal('CSS', { supports: () => true });
  const nativeComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) => {
    if (pseudoElt) {
      return {
        content:
          element === label && pseudoElt === '::before'
            ? trigger.getAttribute('aria-expanded')
            : 'none',
      } as CSSStyleDeclaration;
    }
    return nativeComputedStyle(element);
  });
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  trigger.setAttribute('aria-expanded', 'true');
  resolve('data:image/png;base64,frame');
  await rejected;
});

it('rejects a stylesheet text change while capture is pending', async () => {
  const style = document.createElement('style');
  style.textContent = 'body { color: black; }';
  document.head.append(style);
  const { frame, resolve } = fixture();
  const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
  style.firstChild!.textContent = 'body { color: white; }';
  resolve('data:image/png;base64,frame');
  await rejected;
  style.remove();
});

it('watches mutations inside an accessible iframe and open shadow root', async () => {
  for (const kind of ['iframe', 'shadow']) {
    const host = document.createElement(kind === 'iframe' ? 'iframe' : 'div');
    document.body.append(host);
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 300, 200));
    const target =
      host instanceof HTMLIFrameElement
        ? host.contentDocument!.body
        : host.attachShadow({ mode: 'open' });
    const { frame, resolve } = fixture();
    const rejected = expect(frame).rejects.toThrow('Page changed while acquiring selection frame');
    const button = document.createElement('button');
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 50, 25));
    target.append(button);
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
