// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import {
  createDocumentSignalRegistry,
  type ExplicitMotionSignal,
  type HostLayoutInvalidationOptions,
} from './document-signals';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createMutationSignals(options: { transientMotionAccepted?: boolean } = {}) {
  const callbacks = {
    beginExplicitMotion: vi.fn<(signal: ExplicitMotionSignal) => boolean | void>(),
    beginTransientMotion: vi.fn<(target: Element) => boolean | void>(() =>
      options.transientMotionAccepted === false ? false : undefined
    ),
    continueExplicitMotion: vi.fn<(signal: ExplicitMotionSignal) => boolean | void>(),
    documentWillUnload: vi.fn<(doc: Document) => void>(),
    endExplicitMotion: vi.fn<(signal: ExplicitMotionSignal) => boolean | void>(),
    invalidate: vi.fn<(options?: HostLayoutInvalidationOptions) => void>(),
    registerAddedNode: vi.fn<(node: Node) => void>(),
    unregisterRemovedNode: vi.fn<(node: Node) => void>(),
  };
  return { callbacks, signals: createDocumentSignalRegistry(callbacks) };
}

function createRegisteredContentHost() {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  const shadowRoot = host.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  document.body.appendChild(host);
  return { host, shadowRoot };
}

describe('host document mutation signals', () => {
  it('ignores Sniptale-owned mutation and motion signals', async () => {
    const { callbacks, signals } = createMutationSignals();
    signals.registerDocument(document);
    const { host: owned, shadowRoot } = createRegisteredContentHost();
    const ownedText = document.createTextNode('owned');
    shadowRoot.appendChild(ownedText);
    await Promise.resolve();
    callbacks.invalidate.mockClear();
    callbacks.registerAddedNode.mockClear();
    callbacks.unregisterRemovedNode.mockClear();

    owned.style.transform = 'translateX(10px)';
    owned.setAttribute('data-layout-column', 'wide');
    ownedText.data = 'still owned';
    const ownedChild = document.createElement('span');
    shadowRoot.appendChild(ownedChild);
    ownedChild.remove();
    owned.dispatchEvent(new Event('transitionrun', { bubbles: true }));
    await Promise.resolve();

    expect(callbacks.beginTransientMotion).not.toHaveBeenCalled();
    expect(callbacks.beginExplicitMotion).not.toHaveBeenCalled();
    expect(callbacks.invalidate).not.toHaveBeenCalled();
    expect(callbacks.registerAddedNode).not.toHaveBeenCalled();
    expect(callbacks.unregisterRemovedNode).not.toHaveBeenCalled();
    signals.dispose();
  });

  it('processes page-owned light-DOM children added to and removed from the exact content host', async () => {
    const { host } = createRegisteredContentHost();
    const { callbacks, signals } = createMutationSignals();
    signals.registerDocument(document);
    const pageChild = document.createElement('section');

    host.appendChild(pageChild);
    await vi.waitFor(() => expect(callbacks.registerAddedNode).toHaveBeenCalledWith(pageChild));

    expect(callbacks.registerAddedNode.mock.calls).toEqual([[pageChild]]);
    expect(callbacks.invalidate.mock.calls).toEqual([[undefined]]);
    expect(callbacks.unregisterRemovedNode).not.toHaveBeenCalled();

    callbacks.invalidate.mockClear();
    callbacks.registerAddedNode.mockClear();
    pageChild.remove();
    await vi.waitFor(() => expect(callbacks.unregisterRemovedNode).toHaveBeenCalledWith(pageChild));

    expect(callbacks.unregisterRemovedNode.mock.calls).toEqual([[pageChild]]);
    expect(callbacks.invalidate.mock.calls).toEqual([[undefined]]);
    expect(callbacks.registerAddedNode).not.toHaveBeenCalled();
    signals.dispose();
  });

  it('registers a same-origin iframe added as exact-host light DOM', async () => {
    const { host } = createRegisteredContentHost();
    const { callbacks, signals } = createMutationSignals();
    signals.registerDocument(document);
    const iframe = document.createElement('iframe');

    host.appendChild(iframe);
    await vi.waitFor(() => expect(callbacks.registerAddedNode).toHaveBeenCalledWith(iframe));

    expect(iframe.contentDocument).not.toBeNull();
    expect(callbacks.registerAddedNode.mock.calls).toEqual([[iframe]]);
    expect(callbacks.invalidate.mock.calls).toEqual([[undefined]]);
    signals.dispose();
  });

  it('invalidates sibling text and arbitrary attribute changes as ordinary layout signals', async () => {
    const { callbacks, signals } = createMutationSignals();
    signals.registerDocument(document);
    const target = document.createElement('button');
    const layoutDriver = document.createElement('div');
    const text = document.createTextNode('compact');
    layoutDriver.appendChild(text);
    document.body.append(target, layoutDriver);
    await Promise.resolve();
    callbacks.beginTransientMotion.mockClear();
    callbacks.invalidate.mockClear();

    text.data = 'expanded sibling content';
    await Promise.resolve();

    expect(callbacks.beginTransientMotion).not.toHaveBeenCalled();
    expect(callbacks.invalidate.mock.calls).toEqual([[undefined]]);

    callbacks.invalidate.mockClear();
    layoutDriver.setAttribute('data-layout-column', 'wide');
    await Promise.resolve();

    expect(callbacks.beginTransientMotion).not.toHaveBeenCalled();
    expect(callbacks.invalidate.mock.calls).toEqual([[undefined]]);
    signals.dispose();
  });

  it('invalidates mutations inside a same-id host lookalike', async () => {
    const { callbacks, signals } = createMutationSignals({ transientMotionAccepted: false });
    createRegisteredContentHost();
    signals.registerDocument(document);

    const lookalike = document.createElement('div');
    lookalike.id = CONTENT_ROOT_ID;
    const target = document.createElement('button');
    lookalike.append(target);
    document.body.appendChild(lookalike);
    await Promise.resolve();
    callbacks.invalidate.mockClear();

    lookalike.hidden = true;
    await Promise.resolve();

    expect(callbacks.invalidate).toHaveBeenCalledTimes(1);
    signals.dispose();
  });

  it('does not trust host lookalike classes as content ownership', async () => {
    const { callbacks, signals } = createMutationSignals({ transientMotionAccepted: false });
    signals.registerDocument(document);
    const lookalike = document.createElement('section');
    lookalike.className = 'sniptale-app';
    const target = document.createElement('button');
    lookalike.appendChild(target);
    document.body.appendChild(lookalike);
    await Promise.resolve();
    callbacks.invalidate.mockClear();

    target.hidden = true;
    await Promise.resolve();

    expect(callbacks.invalidate).toHaveBeenCalledTimes(1);
    signals.dispose();
  });

  it('invalidates a non-owned sibling class change without inventing motion', async () => {
    const { callbacks, signals } = createMutationSignals({ transientMotionAccepted: false });
    signals.registerDocument(document);
    const target = document.createElement('button');
    const layoutDriver = document.createElement('div');
    document.body.append(target, layoutDriver);
    await Promise.resolve();
    callbacks.beginTransientMotion.mockClear();
    callbacks.invalidate.mockClear();

    layoutDriver.classList.add('wide-grid');
    await Promise.resolve();

    expect(callbacks.beginTransientMotion).toHaveBeenCalledWith(layoutDriver);
    expect(callbacks.invalidate).toHaveBeenCalledWith(undefined);
    signals.dispose();
  });
});
