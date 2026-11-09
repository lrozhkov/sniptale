// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ReviewSessionContext,
  useCreateReviewSessionRuntime,
  useReviewSessionRuntime,
} from './use-session';
import type { ReviewSessionRuntime } from './runtime';

const mocks = vi.hoisted(() => {
  const state = {
    snapshot: { revision: 0, active: true },
    mode: { enabled: true, tool: 'comment' as 'comment' | 'navigate' },
    annotationListener: null as (() => void) | null,
    modeListener: null as (() => void) | null,
    enable: null as ((enabled: boolean) => void) | null,
    host: null as HTMLElement | null,
  };
  const review = {
    open: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
    changed: vi.fn(() => {
      state.snapshot.revision += 1;
    }),
    getSnapshot: vi.fn(() => state.snapshot),
    setMode: vi.fn(),
    captureCurrent: vi.fn(async () => {}),
    navigatePage: vi.fn(),
    beginNavigation: vi.fn(),
    cancelNavigation: vi.fn(),
    dispose: vi.fn(),
  };
  const client = { dispose: vi.fn() };
  const create = vi.fn((enable: (enabled: boolean) => void) => {
    state.enable = enable;
    return { review, client };
  });
  return {
    state,
    review,
    client,
    create,
    unsubscribeAnnotations: vi.fn(),
    unsubscribeMode: vi.fn(),
    unlock: vi.fn(),
    finalize: vi.fn(),
    flushStyles: vi.fn(),
    clearHistory: vi.fn(),
    trusted: vi.fn((): { kind: 'trusted-content-event' } | null => ({
      kind: 'trusted-content-event',
    })),
  };
});
vi.mock('./dom', () => ({ createDocumentReviewSession: mocks.create }));
vi.mock('../../parser/page-preparation/annotations', () => ({
  browserAnnotationSession: {
    subscribe: (listener: () => void) => {
      mocks.state.annotationListener = listener;
      return mocks.unsubscribeAnnotations;
    },
  },
}));
vi.mock('../../parser/page-preparation/history', () => ({
  pagePreparationHistory: { clear: mocks.clearHistory },
}));
vi.mock('../../selection/design-review', () => ({
  getDesignReviewModeState: () => mocks.state.mode,
  subscribeToDesignReviewMode: (listener: () => void) => {
    mocks.state.modeListener = listener;
    return mocks.unsubscribeMode;
  },
}));
vi.mock('../../selection/locker', () => ({ disableNavigationLock: mocks.unlock }));
vi.mock('../../overlay/design-review/session/comment-draft-finalization', () => ({
  finalizeDesignReviewCommentDraft: mocks.finalize,
}));
vi.mock('../../overlay/design-review/runtime/actions', () => ({
  flushPendingPageStyleHistory: mocks.flushStyles,
}));
vi.mock('../privileged-action-intent', () => ({
  createTrustedContentActionIntentSource: mocks.trusted,
}));
vi.mock('../../platform/dom-host', () => ({
  resolveContentShadowRoot: () => (mocks.state.host ? { host: mocks.state.host } : null),
}));

let root: Root | null;
let container: HTMLDivElement;
let current: ReviewSessionRuntime;
let navigation: EventTarget;
let page: { href: string; protocol: string };
function Harness({ enable }: { enable: (enabled: boolean) => void }) {
  current = useCreateReviewSessionRuntime(enable);
  return null;
}
async function mount(enable = vi.fn()) {
  await act(async () => root!.render(createElement(Harness, { enable })));
  return enable;
}
async function unmount() {
  await act(async () => root?.unmount());
  root = null;
}
function persistedPageShow(persisted: boolean) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.snapshot = { revision: 0, active: true };
  mocks.state.mode = { enabled: true, tool: 'comment' };
  mocks.state.annotationListener = null;
  mocks.state.modeListener = null;
  mocks.state.host = null;
  mocks.state.enable = null;
  page = { href: 'https://example.test/a', protocol: 'https:' };
  navigation = new EventTarget();
  vi.stubGlobal('location', page);
  vi.stubGlobal('navigation', navigation);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await unmount();
  container.remove();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('opens once, synchronizes mode and annotations, and keeps the latest enable callback', async () => {
  const first = await mount();
  expect(current).toBe(mocks.review);
  expect(mocks.review.open).toHaveBeenCalledTimes(1);
  expect(mocks.review.setMode).toHaveBeenCalledWith(true, 'comment');
  expect(mocks.review.changed).toHaveBeenCalledTimes(1);
  mocks.state.annotationListener!();
  expect(mocks.review.changed).toHaveBeenCalledTimes(2);
  mocks.state.mode = { enabled: true, tool: 'navigate' };
  mocks.state.modeListener!();
  expect(mocks.review.setMode).toHaveBeenLastCalledWith(true, 'navigate');
  expect(mocks.unlock).toHaveBeenCalledTimes(1);
  const latest = vi.fn();
  await mount(latest);
  mocks.state.enable!(false);
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith(false);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});

it('fences navigation start and handles success, cancellation, hash, and history changes', async () => {
  await mount();
  navigation.dispatchEvent(new Event('navigate'));
  expect(mocks.finalize).toHaveBeenCalledTimes(1);
  expect(mocks.flushStyles).toHaveBeenCalledTimes(1);
  expect(mocks.review.beginNavigation).toHaveBeenCalledTimes(1);
  navigation.dispatchEvent(new Event('navigateerror'));
  expect(mocks.review.cancelNavigation).toHaveBeenCalledTimes(1);
  navigation.dispatchEvent(new Event('navigatesuccess'));
  expect(mocks.review.cancelNavigation).toHaveBeenCalledTimes(2);
  page.href = 'https://example.test/b';
  navigation.dispatchEvent(new Event('navigatesuccess'));
  expect(mocks.clearHistory).toHaveBeenCalledTimes(1);
  expect(mocks.review.navigatePage).toHaveBeenCalledTimes(1);
  page.href += '#route';
  window.dispatchEvent(new Event('hashchange'));
  page.href = 'https://example.test/a';
  window.dispatchEvent(new Event('popstate'));
  expect(mocks.review.navigatePage).toHaveBeenCalledTimes(3);
  window.dispatchEvent(new Event('beforeunload'));
  expect(mocks.review.beginNavigation).toHaveBeenCalledTimes(2);
  mocks.state.snapshot.active = false;
  navigation.dispatchEvent(new Event('navigate'));
  page.href = 'https://example.test/inactive';
  window.dispatchEvent(new Event('popstate'));
  expect(mocks.review.beginNavigation).toHaveBeenCalledTimes(2);
  expect(mocks.review.navigatePage).toHaveBeenCalledTimes(3);
});

it('debounces capture only after a trusted toolbar gesture and cancels capture on cleanup', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const host = document.createElement('section');
  const button = document.createElement('button');
  host.attachShadow({ mode: 'open' }).append(button);
  document.body.append(host);
  mocks.state.host = host;
  await mount();
  await act(async () => {
    document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });
  expect(mocks.trusted).not.toHaveBeenCalled();
  await act(async () => {
    button.dispatchEvent(new Event('pointerup', { bubbles: true, composed: true }));
  });
  expect(mocks.trusted).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(599));
  expect(mocks.review.captureCurrent).not.toHaveBeenCalled();
  mocks.state.annotationListener!();
  await act(async () => vi.advanceTimersByTime(600));
  expect(mocks.review.captureCurrent).toHaveBeenCalledExactlyOnceWith({
    kind: 'trusted-content-event',
  });
  await act(async () => {
    button.dispatchEvent(new Event('keydown', { bubbles: true, composed: true }));
  });
  await unmount();
  await act(async () => vi.advanceTimersByTime(600));
  expect(mocks.review.captureCurrent).toHaveBeenCalledTimes(1);
  expect(mocks.unsubscribeAnnotations).toHaveBeenCalledTimes(1);
  expect(mocks.unsubscribeMode).toHaveBeenCalledTimes(1);
  expect(mocks.review.dispose).toHaveBeenCalledTimes(1);
  expect(mocks.client.dispose).toHaveBeenCalledTimes(1);
  navigation.dispatchEvent(new Event('navigate'));
  expect(mocks.review.beginNavigation).not.toHaveBeenCalled();
});

it('does not capture without a toolbar host or trusted source', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await mount();
  window.dispatchEvent(new Event('focusout'));
  expect(mocks.trusted).not.toHaveBeenCalled();
  const host = document.createElement('button');
  document.body.append(host);
  mocks.state.host = host;
  mocks.trusted.mockReturnValueOnce(null);
  await act(async () => {
    host.dispatchEvent(new Event('focusout', { bubbles: true }));
  });
  await act(async () => vi.advanceTimersByTime(600));
  expect(mocks.review.captureCurrent).not.toHaveBeenCalled();
});

it('flushes pagehide changes and restores a persisted page only after retry admission', async () => {
  await mount();
  mocks.review.flush.mockRejectedValueOnce(new Error('Flush unavailable'));
  await act(async () => {
    window.dispatchEvent(new Event('pagehide'));
  });
  expect(mocks.finalize).toHaveBeenCalledTimes(1);
  expect(mocks.review.flush).toHaveBeenCalledTimes(1);
  await act(async () => {
    window.dispatchEvent(persistedPageShow(false));
  });
  expect(mocks.review.retry).not.toHaveBeenCalled();
  await act(async () => {
    window.dispatchEvent(persistedPageShow(true));
  });
  expect(mocks.client.dispose).toHaveBeenCalledTimes(1);
  expect(mocks.review.retry).toHaveBeenCalledTimes(1);
  expect(mocks.review.navigatePage).toHaveBeenCalledTimes(1);
  expect(mocks.review.setMode).toHaveBeenCalledTimes(2);
  mocks.review.retry.mockRejectedValueOnce(new Error('Read unavailable'));
  await act(async () => {
    window.dispatchEvent(persistedPageShow(true));
  });
  expect(mocks.review.navigatePage).toHaveBeenCalledTimes(1);
});

it('does not synchronize an open or BFCache retry that resolves after unmount', async () => {
  let finishOpen!: () => void;
  mocks.review.open.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishOpen = resolve;
    })
  );
  await mount();
  await unmount();
  await act(async () => finishOpen());
  expect(mocks.review.setMode).not.toHaveBeenCalled();
  expect(mocks.review.changed).not.toHaveBeenCalled();
  root = createRoot(container);
  await mount();
  let finishRetry!: () => void;
  mocks.review.retry.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishRetry = resolve;
    })
  );
  await act(async () => {
    window.dispatchEvent(persistedPageShow(true));
  });
  await unmount();
  await act(async () => finishRetry());
  expect(mocks.review.navigatePage).not.toHaveBeenCalled();
});

it('does not mount page listeners on unsupported protocols and retains open failures', async () => {
  page.protocol = 'chrome-extension:';
  await mount();
  expect(mocks.review.open).not.toHaveBeenCalled();
  expect(mocks.state.annotationListener).toBeNull();
  await unmount();
  root = createRoot(container);
  page.protocol = 'https:';
  mocks.review.open.mockRejectedValueOnce(new Error('Storage unavailable'));
  await mount();
  expect(mocks.review.setMode).not.toHaveBeenCalled();
  expect(mocks.review.changed).not.toHaveBeenCalled();
});

it('exposes the supplied review runtime through context', async () => {
  await mount();
  const supplied = current;
  let value: ReviewSessionRuntime | null = null;
  function Consumer() {
    value = useReviewSessionRuntime();
    return null;
  }
  await act(async () => root!.render(createElement(Consumer)));
  expect(value).toBeNull();
  await act(async () =>
    root!.render(
      createElement(ReviewSessionContext.Provider, { value: supplied }, createElement(Consumer))
    )
  );
  expect(value).toBe(supplied);
});
