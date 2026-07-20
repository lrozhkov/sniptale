// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const iframeCoreMocks = vi.hoisted(() => ({
  getAccessibleIframesMock: vi.fn(),
  getIframeDocumentMock: vi.fn(),
  isIframeAccessibleMock: vi.fn(),
}));

vi.mock('./core', () => ({
  getAccessibleIframes: iframeCoreMocks.getAccessibleIframesMock,
  getIframeDocument: iframeCoreMocks.getIframeDocumentMock,
  isIframeAccessible: iframeCoreMocks.isIframeAccessibleMock,
}));

type MutationRecordLike = Pick<MutationRecord, 'addedNodes'>;

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];

  constructor(public readonly callback: (mutations: MutationRecordLike[]) => void) {
    FakeMutationObserver.instances.push(this);
  }

  disconnect = vi.fn();

  observe = vi.fn();

  emit(addedNodes: Node[]) {
    this.callback([{ addedNodes: addedNodes as unknown as NodeList }]);
  }

  static reset() {
    FakeMutationObserver.instances = [];
  }
}

function createTrackedWindow() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window;
}

function createTrackedDocument(win: Window) {
  return {
    body: document.createElement('div'),
    defaultView: win,
  } as unknown as Document;
}

beforeEach(() => {
  FakeMutationObserver.reset();
  vi.stubGlobal('MutationObserver', FakeMutationObserver);
  iframeCoreMocks.getAccessibleIframesMock.mockReset();
  iframeCoreMocks.getIframeDocumentMock.mockReset();
  iframeCoreMocks.isIframeAccessibleMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('iframe-utils-scroll-listeners attachment flow', () => {
  it('attaches debounced scroll and resize listeners to top-level and iframe windows', async () => {
    vi.useFakeTimers();
    const iframe = document.createElement('iframe');
    const iframeWindow = createTrackedWindow();
    const iframeDocument = createTrackedDocument(iframeWindow);
    const topAddSpy = vi.spyOn(window, 'addEventListener');
    const topRemoveSpy = vi.spyOn(window, 'removeEventListener');
    const handler = vi.fn();

    iframeCoreMocks.getAccessibleIframesMock.mockImplementation((rootDoc?: Document) =>
      rootDoc && rootDoc !== document ? [] : [iframe]
    );
    iframeCoreMocks.getIframeDocumentMock.mockReturnValue(iframeDocument);
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const { addScrollListenersToAllWindows } = await import('./scroll-listeners');
    const cleanup = addScrollListenersToAllWindows(handler, 50);

    expect(topAddSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(topAddSpy).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true });
    expect(iframeWindow.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });
    expect(iframeWindow.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function), {
      passive: true,
    });

    const debouncedHandler = topAddSpy.mock.calls[0]?.[1] as (() => void) | undefined;
    debouncedHandler?.();
    debouncedHandler?.();
    vi.advanceTimersByTime(49);
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();

    expect(topRemoveSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(topRemoveSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(iframeWindow.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(iframeWindow.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});

describe('iframe-utils-scroll-listeners mutation flow', () => {
  it('observes added iframes, ignores owned overlays, and attaches after iframe load', async () => {
    const iframeWindow = createTrackedWindow();
    const iframeDocument = createTrackedDocument(iframeWindow);
    const nestedIframe = document.createElement('iframe');
    let accessible = false;

    iframeCoreMocks.getAccessibleIframesMock.mockImplementation(() => []);
    iframeCoreMocks.getIframeDocumentMock.mockImplementation((iframe: HTMLIFrameElement) =>
      iframe === nestedIframe && accessible ? iframeDocument : null
    );
    iframeCoreMocks.isIframeAccessibleMock.mockImplementation(
      (iframe: HTMLIFrameElement) => iframe === nestedIframe && accessible
    );

    const { addScrollListenersToAllWindows } = await import('./scroll-listeners');
    const cleanup = addScrollListenersToAllWindows(vi.fn(), 25);
    const observer = FakeMutationObserver.instances[0];

    const ownedWrapper = document.createElement('div');
    ownedWrapper.className = 'sniptale-app';
    ownedWrapper.append(nestedIframe.cloneNode() as HTMLIFrameElement);
    observer?.emit([ownedWrapper]);
    expect(iframeWindow.addEventListener).not.toHaveBeenCalled();

    const wrapper = document.createElement('div');
    wrapper.append(nestedIframe);
    observer?.emit([wrapper]);
    expect(iframeWindow.addEventListener).not.toHaveBeenCalled();

    accessible = true;
    nestedIframe.dispatchEvent(new Event('load'));

    expect(iframeWindow.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });
    expect(iframeWindow.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function), {
      passive: true,
    });

    cleanup();
    expect(observer?.disconnect).toHaveBeenCalled();
  });
});

describe('iframe-utils-scroll-listeners top-level flow', () => {
  it('debounces top-level window events when no iframe windows are accessible', async () => {
    vi.useFakeTimers();
    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([]);
    iframeCoreMocks.getIframeDocumentMock.mockReturnValue(null);
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(false);
    const handler = vi.fn();

    const { addScrollListenersToAllWindows } = await import('./scroll-listeners');
    const cleanup = addScrollListenersToAllWindows(handler, 10);

    expect(FakeMutationObserver.instances).toHaveLength(1);

    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(10);
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
