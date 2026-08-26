import { expect, expectTypeOf, it } from 'vitest';

import { CaptureMessageType, CaptureType } from './capture-messages';
import type { CaptureArea, CaptureMessage } from './capture-messages';
import {
  PAGE_ACCESS_ALL_SITES_CONTENT_SCRIPT_MATCHES,
  PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS,
  PAGE_ACCESS_FILE_SCHEME_ORIGIN_PATTERN,
  PageAccessOperation,
} from './page-access';
import type { PageAccessMessage, PageAccessResponse } from './page-access';

it('keeps capture and page-access message vocabularies stable', () => {
  expect(Object.values(CaptureType)).toEqual(['visible', 'full', 'selection']);
  expect(CaptureMessageType.CAPTURE_ERROR).toBe('CAPTURE_ERROR');
  expect(PageAccessOperation.GRANT_SITE).toBe('grant-site');
  expect(PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS).toEqual(['<all_urls>']);
  expect(PAGE_ACCESS_ALL_SITES_CONTENT_SCRIPT_MATCHES).toEqual(['http://*/*', 'https://*/*']);
  expect(PAGE_ACCESS_FILE_SCHEME_ORIGIN_PATTERN).toBe('file:///');
  expectTypeOf<CaptureMessage>().toMatchTypeOf<{ type: string; area?: CaptureArea }>();
  expectTypeOf<PageAccessMessage>().toMatchTypeOf<{ operation: string; tabId?: number }>();
  expectTypeOf<Extract<PageAccessResponse, { success: true }>['status']>().toMatchTypeOf<{
    supported: boolean;
  }>();
  expectTypeOf<Exclude<PageAccessResponse, { success: true }>['error']>().toEqualTypeOf<
    string | undefined
  >();
});
