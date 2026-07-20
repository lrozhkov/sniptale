import { expect, expectTypeOf, it } from 'vitest';

import { CaptureMessageType, CaptureType } from './capture-messages';
import type { CaptureArea, CaptureMessage } from './capture-messages';
import {
  PAGE_ACCESS_ALL_SITES_CONTENT_SCRIPT_MATCHES,
  PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS,
  PageAccessOperation,
} from './page-access';
import type { PageAccessMessage, PageAccessResponse } from './page-access';
import {
  isRecordingDownloadStageId,
  MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES,
  MAX_RECORDING_DOWNLOAD_STAGE_CHUNKS,
} from './recording-download';

it('keeps capture and page-access message vocabularies stable', () => {
  expect(Object.values(CaptureType)).toEqual(['visible', 'full', 'selection']);
  expect(CaptureMessageType.CAPTURE_ERROR).toBe('CAPTURE_ERROR');
  expect(PageAccessOperation.GRANT_SITE).toBe('grant-site');
  expect(PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS).toEqual(['<all_urls>']);
  expect(PAGE_ACCESS_ALL_SITES_CONTENT_SCRIPT_MATCHES).toEqual(['http://*/*', 'https://*/*']);
  expectTypeOf<CaptureMessage>().toMatchTypeOf<{ type: string; area?: CaptureArea }>();
  expectTypeOf<PageAccessMessage>().toMatchTypeOf<{ operation: string; tabId?: number }>();
  expectTypeOf<Extract<PageAccessResponse, { success: true }>['status']>().toMatchTypeOf<{
    supported: boolean;
  }>();
  expectTypeOf<Exclude<PageAccessResponse, { success: true }>['error']>().toEqualTypeOf<
    string | undefined
  >();
});

it('accepts only bounded recording stage identifiers', () => {
  expect(MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES).toBe(512 * 1024);
  expect(MAX_RECORDING_DOWNLOAD_STAGE_CHUNKS).toBe(1024);
  expect(isRecordingDownloadStageId('session_1-part-A')).toBe(true);
  expect(isRecordingDownloadStageId('a'.repeat(128))).toBe(true);

  for (const value of ['', 'contains space', 'contains.dot', 'a'.repeat(129), null, 1]) {
    expect(isRecordingDownloadStageId(value)).toBe(false);
  }
});
