// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  installContentRuntimeMessagingMock,
  resetContentRuntimeMessagingMock,
} from '../../platform/runtime-services/services.test-support';
import { captureWebSnapshotScreenshotWithWarnings } from './capture';

const sendRuntimeMessage = vi.fn();
const MASK_ATTRIBUTE = 'data-sniptale-sensitive-screenshot-mask';
const captureGeometry = {
  devicePixelRatio: 1,
  extentHeight: 768,
  extentWidth: 1024,
  outputHeight: 768,
  outputWidth: 1024,
  rootKind: 'viewport' as const,
  rootViewport: { height: 768, width: 1024, x: 0, y: 0 },
  viewportHeight: 768,
  viewportWidth: 1024,
};

beforeEach(() => {
  document.body.innerHTML = '';
  sendRuntimeMessage.mockReset();
  installContentRuntimeMessagingMock(sendRuntimeMessage);
});

afterEach(() => {
  document.body.innerHTML = '';
  resetContentRuntimeMessagingMock();
});

it('masks sensitive controls in light DOM and open shadow roots only while capturing', async () => {
  const documentQuerySelectorAll = vi.spyOn(Document.prototype, 'querySelectorAll');
  document.body.innerHTML = [
    '<input name="query" value="ordinary" style="opacity: 0.8">',
    '<input autocomplete="one-time-code" value="123456"',
    ' style="opacity:1!important;transition:opacity 10s!important;animation:pulse 10s!important">',
    '<textarea autocomplete="current-password">secret</textarea>',
    '<select autocomplete="cc-exp-month"><option selected>12</option></select>',
  ].join('');
  const host = document.createElement('section');
  host.id = 'sniptale-extension-root';
  document.body.append(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = '<input autocomplete="cc-number" value="4111111111111111">';

  const ordinary = document.querySelector<HTMLElement>('input[name="query"]');
  const sensitive = Array.from(
    document.querySelectorAll<HTMLElement>('input[autocomplete], textarea, select')
  );
  const shadowSensitive = shadowRoot.querySelector<HTMLElement>('input');
  if (!ordinary || !shadowSensitive) throw new Error('Expected screenshot controls');

  sendRuntimeMessage.mockImplementation(async () => {
    expect(ordinary.style.opacity).toBe('0.8');
    for (const control of [...sensitive, shadowSensitive]) {
      expect(control.getAttribute(MASK_ATTRIBUTE)).toBeTruthy();
      expect(control.style.getPropertyValue('opacity')).toBe('0');
      expect(control.style.getPropertyPriority('opacity')).toBe('important');
      expect(control.style.getPropertyValue('transition')).toBe('none');
      expect(control.style.getPropertyValue('animation')).toBe('none');
    }

    const lateControl = document.createElement('input');
    lateControl.autocomplete = 'one-time-code';
    lateControl.style.setProperty('opacity', '1', 'important');
    lateControl.style.setProperty('transition', 'opacity 10s', 'important');
    document.body.append(lateControl);
    const lateHost = document.createElement('div');
    const lateRoot = lateHost.attachShadow({ mode: 'open' });
    lateRoot.innerHTML = '<textarea autocomplete="current-password">late secret</textarea>';
    document.body.append(lateHost);
    await Promise.resolve();
    await Promise.resolve();
    expect(lateControl.getAttribute(MASK_ATTRIBUTE)).toBeTruthy();
    expect(lateControl.style.getPropertyValue('opacity')).toBe('0');
    expect(lateControl.style.getPropertyValue('transition')).toBe('none');
    expect(lateRoot.querySelector('textarea')?.getAttribute(MASK_ATTRIBUTE)).toBeTruthy();
    expect(
      documentQuerySelectorAll.mock.calls.filter(([selector]) => selector === '*')
    ).toHaveLength(1);
    return { captureGeometry, dataUrl: 'data:image/png;base64,cG5n', success: true };
  });

  await captureWebSnapshotScreenshotWithWarnings(undefined, {
    action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    exportRunId: 'masked-capture',
  });

  expect(ordinary.style.opacity).toBe('0.8');
  for (const control of [...sensitive, shadowSensitive]) {
    expect(control.hasAttribute(MASK_ATTRIBUTE)).toBe(false);
  }
  expect(document.querySelector(`[${MASK_ATTRIBUTE}]`)).toBeNull();
  expect(sensitive[0]?.style.getPropertyValue('opacity')).toBe('1');
  expect(sensitive[0]?.style.getPropertyPriority('opacity')).toBe('important');
  expect(sensitive[0]?.style.getPropertyValue('transition')).toBe('opacity 10s');
  expect(sensitive[0]?.style.getPropertyValue('animation')).toBe('pulse 10s');
});

it('restores sensitive control markers without changing page styles when capture fails', async () => {
  document.body.innerHTML =
    '<input autocomplete="one-time-code" value="123456" style="opacity: 0.6">';
  const sensitive = document.querySelector<HTMLElement>('input');
  if (!sensitive) throw new Error('Expected sensitive control');
  sendRuntimeMessage.mockRejectedValue(new Error('capture transport failed'));

  await expect(
    captureWebSnapshotScreenshotWithWarnings(undefined, {
      action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      exportRunId: 'failed-masked-capture',
    })
  ).rejects.toThrow('capture transport failed');

  expect(sensitive.style.getPropertyValue('opacity')).toBe('0.6');
  expect(sensitive.style.getPropertyPriority('opacity')).toBe('');
  expect(sensitive.hasAttribute(MASK_ATTRIBUTE)).toBe(false);
});

it('masks an open shadow root attached to an existing host during capture', async () => {
  const host = document.createElement('section');
  document.body.append(host);

  sendRuntimeMessage.mockImplementation(async () => {
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<input autocomplete="current-password" value="late secret">';
    const sensitive = root.querySelector<HTMLElement>('input');
    if (!sensitive) throw new Error('Expected late shadow control');

    await vi.waitFor(() => expect(sensitive.getAttribute(MASK_ATTRIBUTE)).toBeTruthy());
    expect(sensitive.style.getPropertyValue('opacity')).toBe('0');
    return { captureGeometry, dataUrl: 'data:image/png;base64,cG5n', success: true };
  });

  await captureWebSnapshotScreenshotWithWarnings(undefined, {
    action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    exportRunId: 'late-shadow-root-capture',
  });

  expect(host.shadowRoot?.querySelector('input')?.hasAttribute(MASK_ATTRIBUTE)).toBe(false);
});

it('aborts an unresolved screenshot request and restores sensitive controls promptly', async () => {
  document.body.innerHTML = '<input autocomplete="one-time-code" value="123456">';
  const sensitive = document.querySelector<HTMLElement>('input');
  if (!sensitive) throw new Error('Expected sensitive control');
  sendRuntimeMessage.mockReturnValue(new Promise(() => undefined));
  const controller = new AbortController();

  const capture = captureWebSnapshotScreenshotWithWarnings(
    undefined,
    {
      action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      exportRunId: 'cancelled-masked-capture',
    },
    controller.signal
  );
  await vi.waitFor(() => expect(sensitive.getAttribute(MASK_ATTRIBUTE)).toBeTruthy());
  controller.abort(new Error('Web snapshot save was cancelled'));

  await expect(capture).rejects.toThrow('Web snapshot save was cancelled');
  expect(sensitive.hasAttribute(MASK_ATTRIBUTE)).toBe(false);
});

it('rejects a screenshot response without canonical capture geometry', async () => {
  sendRuntimeMessage.mockResolvedValue({
    dataUrl: 'data:image/png;base64,cG5n',
    success: true,
  });

  await expect(
    captureWebSnapshotScreenshotWithWarnings(undefined, {
      action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      exportRunId: 'missing-geometry',
    })
  ).rejects.toThrow();
});
