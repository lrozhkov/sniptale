// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../files/modal-utils', async () => {
  const actual =
    await vi.importActual<typeof import('../files/modal-utils')>('../files/modal-utils');
  return {
    ...actual,
    closeModal: vi.fn(async () => undefined),
    delay: vi.fn(async () => undefined),
    waitForElement: vi.fn(),
  };
});

import * as modalUtils from '../files/modal-utils';
import {
  buildDiagnosticElementPath,
  dismissPreviewModal,
  getCurrentExportPageUrl,
  listAccessibleDiagnosticDocuments,
  listComputedStyleRootTargets,
  listDirectDownloadLinks,
  listPageImages,
  listPreviewTriggers,
  queryComputedStyleTargets,
  resolvePreviewDownloadHref,
} from './dom-driver';

const closeModalMock = vi.mocked(modalUtils.closeModal);
const delayMock = vi.mocked(modalUtils.delay);
const waitForElementMock = vi.mocked(modalUtils.waitForElement);

function createVisibleModal(downloadUrl?: string): HTMLElement {
  const modal = document.createElement('div');
  modal.id = 'gwt-debug-filePreview';
  Object.defineProperty(modal, 'offsetWidth', { configurable: true, value: 120 });
  Object.defineProperty(modal, 'offsetHeight', { configurable: true, value: 40 });

  if (downloadUrl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'downloadButton';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', '');
    wrapper.append(link);
    modal.append(wrapper);
  }

  return modal;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  closeModalMock.mockReset();
  delayMock.mockReset();
  waitForElementMock.mockReset();
});

it('lists direct download anchors and preview triggers from the current DOM', () => {
  const directLink = document.createElement('a');
  directLink.href = 'https://example.com/download/report.pdf';
  directLink.setAttribute('download', '');
  document.body.append(directLink);

  const preview = document.createElement('img');
  preview.setAttribute('style', 'cursor: pointer');
  document.body.append(preview);

  expect(listDirectDownloadLinks()).toEqual([directLink]);
  expect(listPreviewTriggers()).toEqual([preview]);
});

it('exposes the live DOM inputs used by diagnostic collectors', () => {
  document.body.innerHTML =
    '<section><span></span><span id="target"></span><img alt="sample"><iframe></iframe></section>';
  const target = document.querySelector('#target');
  const iframe = document.querySelector('iframe');

  expect(target).not.toBeNull();
  expect(iframe).not.toBeNull();
  expect(listPageImages()).toHaveLength(1);
  expect(listComputedStyleRootTargets()).toEqual([document.documentElement, document.body]);
  expect(queryComputedStyleTargets('span')).toHaveLength(2);
  expect(buildDiagnosticElementPath(target!)).toContain('span:nth-of-type(2)');
  expect(getCurrentExportPageUrl('https://snapshot.example/page')).toBe(
    'https://snapshot.example/page'
  );
  expect(getCurrentExportPageUrl()).toBe(window.location.href);

  const scopes = listAccessibleDiagnosticDocuments();
  expect(scopes[0]).toEqual({ document, scope: 'document' });
  if (iframe!.contentDocument) {
    expect(scopes).toContainEqual({ document: iframe!.contentDocument, scope: 'iframe-1' });
  }
});

it('resolves a preview download href through the modal driver seam', async () => {
  const preview = document.createElement('img');
  document.body.append(preview);
  const clickSpy = vi.spyOn(preview, 'click');
  waitForElementMock.mockResolvedValue(createVisibleModal('/files/photo.png'));
  const expectedUrl = new URL('/files/photo.png', window.location.href).toString();

  await expect(resolvePreviewDownloadHref(preview)).resolves.toBe(expectedUrl);
  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(delayMock).toHaveBeenCalledWith(300);
});

it('returns null and logs when the preview modal never appears', async () => {
  const preview = document.createElement('img');
  document.body.append(preview);
  waitForElementMock.mockResolvedValue(null);
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  await expect(resolvePreviewDownloadHref(preview)).resolves.toBeNull();

  expect(warnSpy).toHaveBeenCalledWith(
    '[ContentExportManager]',
    'Modal did not appear for preview',
    preview
  );
});

it('returns null when the preview modal lacks a valid download link', async () => {
  const preview = document.createElement('img');
  document.body.append(preview);
  waitForElementMock.mockResolvedValue(createVisibleModal());

  await expect(resolvePreviewDownloadHref(preview)).resolves.toBeNull();
});

it('skips unsafe preview triggers that could navigate the host page', async () => {
  const preview = document.createElement('a');
  preview.href = 'https://example.com/preview';
  const clickSpy = vi.spyOn(preview, 'click');
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  await expect(resolvePreviewDownloadHref(preview)).resolves.toBeNull();

  expect(clickSpy).not.toHaveBeenCalled();
  expect(waitForElementMock).not.toHaveBeenCalled();
  expect(warnSpy).toHaveBeenCalledWith(
    '[ContentExportManager]',
    'Skipped unsafe preview trigger',
    preview
  );
});

it('skips detached preview triggers blocked by the host-page click guard', async () => {
  const preview = document.createElement('img');
  const clickSpy = vi.spyOn(preview, 'click');
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  await expect(resolvePreviewDownloadHref(preview)).resolves.toBeNull();

  expect(clickSpy).not.toHaveBeenCalled();
  expect(waitForElementMock).not.toHaveBeenCalled();
  expect(warnSpy).toHaveBeenCalledWith(
    '[ContentExportManager]',
    'Skipped preview trigger blocked by host-page click guard',
    {
      element: preview,
      reason: 'detached',
    }
  );
});

it('dismisses preview modals through the shared modal utils seam', async () => {
  await dismissPreviewModal();

  expect(closeModalMock).toHaveBeenCalledTimes(1);
  expect(delayMock).toHaveBeenCalledWith(200);
});
