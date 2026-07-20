// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  listFroalaIframes,
  resolveFroalaIframeBody,
  resolveFroalaPopupUrlFromImage,
} from './driver';
import * as filePreviewDriver from '../../popup-export/preview-url';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('lists only Froala-like iframes from the live document', () => {
  const richTextIframe = document.createElement('iframe');
  richTextIframe.src = 'https://example.com/richText?id=1';

  const legacyIframe = document.createElement('iframe');
  legacyIframe.id = 'iframe$42';

  const dynamicFieldsIframe = document.createElement('iframe');
  dynamicFieldsIframe.src = 'https://example.com/richText?id=2';
  dynamicFieldsIframe.setAttribute('data-application-code', 'dynamicFields');

  const unrelatedIframe = document.createElement('iframe');
  unrelatedIframe.src = 'https://example.com/other';

  document.body.append(richTextIframe, legacyIframe, dynamicFieldsIframe, unrelatedIframe);

  expect(listFroalaIframes()).toEqual([richTextIframe, legacyIframe]);
});

it('returns the iframe body only for inspectable Froala contexts', () => {
  const iframe = document.createElement('iframe');
  iframe.src = 'https://example.com/richText?id=1';
  const iframeDocument = document.implementation.createHTMLDocument('iframe');
  Object.defineProperty(iframe, 'contentDocument', { configurable: true, value: iframeDocument });

  expect(resolveFroalaIframeBody(iframe, 'https://example.com/page')).toBe(iframeDocument.body);
  expect(resolveFroalaIframeBody(iframe, 'https://other.example/page')).toBeNull();
});

it('returns null when the iframe has no inspectable body document', () => {
  const iframe = document.createElement('iframe');
  iframe.src = 'https://example.com/richText?id=1';

  expect(resolveFroalaIframeBody(iframe, 'https://example.com/page')).toBeNull();
});

it('forwards popup resolution through the shared file-preview DOM-driver seam', async () => {
  const previewImage = document.createElement('img');
  const resolveFilePreviewUrlFromTriggerSpy = vi
    .spyOn(filePreviewDriver, 'resolveFilePreviewUrlFromTrigger')
    .mockResolvedValue('https://example.com/download?uuid=file$55');

  await expect(
    resolveFroalaPopupUrlFromImage({
      imgElement: previewImage,
      fallbackUrl: './download?uuid=file$55',
      timeoutMs: 50,
    })
  ).resolves.toBe('https://example.com/download?uuid=file$55');

  expect(resolveFilePreviewUrlFromTriggerSpy).toHaveBeenCalledWith({
    trigger: previewImage,
    fallbackUrl: './download?uuid=file$55',
    timeoutMs: 50,
    targetDocument: document,
  });
});

it('passes through the DOM-driver fallback URL unchanged', async () => {
  const previewImage = document.createElement('img');
  vi.spyOn(filePreviewDriver, 'resolveFilePreviewUrlFromTrigger').mockResolvedValue(
    './download?uuid=file$fallback'
  );

  await expect(
    resolveFroalaPopupUrlFromImage({
      imgElement: previewImage,
      fallbackUrl: './download?uuid=file$fallback',
    })
  ).resolves.toBe('./download?uuid=file$fallback');
});
