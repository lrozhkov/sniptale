// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { readScenarioEditorFileAsDataUrl } from './file-reader';

type MockReadMode = 'abort' | 'error' | 'error-without-detail' | 'success' | 'unsupported';

class MockFileReader {
  static mode: MockReadMode = 'success';

  error: DOMException | null = null;
  onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  result: string | ArrayBuffer | null = null;

  readAsDataURL(file: File): void {
    if (MockFileReader.mode === 'error') {
      this.error = new DOMException('read failed', 'NotReadableError');
      this.onerror?.(createFileReaderEvent());
      return;
    }
    if (MockFileReader.mode === 'error-without-detail') {
      this.onerror?.(createFileReaderEvent());
      return;
    }
    if (MockFileReader.mode === 'abort') {
      this.onabort?.(createFileReaderEvent());
      return;
    }
    if (MockFileReader.mode === 'unsupported') {
      this.result = new ArrayBuffer(1);
      this.onload?.(createFileReaderEvent());
      return;
    }

    this.result = `data:${file.type};base64,aW1n`;
    this.onload?.(createFileReaderEvent());
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockFileReader.mode = 'success';
});

it('reads scenario editor files as data URLs', async () => {
  vi.stubGlobal('FileReader', MockFileReader);

  await expect(
    readScenarioEditorFileAsDataUrl(new File(['image'], 'diagram.png', { type: 'image/png' }))
  ).resolves.toBe('data:image/png;base64,aW1n');
});

it('rejects explicit file read failures and aborts', async () => {
  vi.stubGlobal('FileReader', MockFileReader);

  MockFileReader.mode = 'error';
  await expect(
    readScenarioEditorFileAsDataUrl(new File(['image'], 'broken.png', { type: 'image/png' }))
  ).rejects.toThrow('read failed');

  MockFileReader.mode = 'abort';
  await expect(
    readScenarioEditorFileAsDataUrl(new File(['image'], 'aborted.png', { type: 'image/png' }))
  ).rejects.toThrow('aborted');
});

it('rejects missing failure details and unsupported reader results', async () => {
  vi.stubGlobal('FileReader', MockFileReader);

  MockFileReader.mode = 'error-without-detail';
  await expect(
    readScenarioEditorFileAsDataUrl(new File(['image'], 'unknown.png', { type: 'image/png' }))
  ).rejects.toThrow('Failed to read scenario editor file');

  MockFileReader.mode = 'unsupported';
  await expect(
    readScenarioEditorFileAsDataUrl(new File(['image'], 'buffer.png', { type: 'image/png' }))
  ).rejects.toThrow('unsupported result');
});

function createFileReaderEvent(): ProgressEvent<FileReader> {
  return new ProgressEvent('load') as ProgressEvent<FileReader>;
}
