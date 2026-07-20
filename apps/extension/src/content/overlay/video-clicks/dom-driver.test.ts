// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoClicksDomDriver } from './dom-driver';

beforeEach(() => {
  vi.restoreAllMocks();
});

it('renders ripple nodes inside the injected document and removes them after the timeout', () => {
  vi.useFakeTimers();
  const targetDocument = document.implementation.createHTMLDocument('video-clicks');
  const appendOverlayNode = <T extends Node>(node: T): T => {
    targetDocument.body.appendChild(node);
    return node;
  };
  const driver = createVideoClicksDomDriver({
    appendOverlayNode,
    targetDocument,
    targetHead: targetDocument.head,
  });

  driver.showRipple(30, 40);

  expect(targetDocument.body.querySelector('div')).not.toBeNull();
  expect(targetDocument.getElementById('video-ripple-styles')).not.toBeNull();
  expect(document.getElementById('video-ripple-styles')).toBeNull();

  vi.runAllTimers();
  expect(targetDocument.body.querySelector('div')).toBeNull();
});

it('reuses the injected ripple stylesheet for repeated effects', () => {
  const targetDocument = document.implementation.createHTMLDocument('video-clicks');
  const scheduledTimeouts: Array<ReturnType<typeof setTimeout>> = [];
  const driver = createVideoClicksDomDriver({
    appendOverlayNode: <T extends Node>(node: T) => {
      targetDocument.body.appendChild(node);
      return node;
    },
    scheduleTimeout: vi.fn((callback, delay) => {
      const timeoutId = globalThis.setTimeout(callback, delay);
      scheduledTimeouts.push(timeoutId);
      return timeoutId;
    }),
    targetDocument,
    targetHead: targetDocument.head,
  });

  driver.showRipple(10, 20);
  driver.showRipple(20, 30);

  expect(targetDocument.head.querySelectorAll('style#video-ripple-styles')).toHaveLength(1);

  scheduledTimeouts.forEach((timeoutId) => globalThis.clearTimeout(timeoutId));
});
