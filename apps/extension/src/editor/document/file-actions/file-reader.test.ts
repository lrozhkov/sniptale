// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileAsDataUrl, readFileAsText } from './file-reader';

class SuccessfulFileReader {
  error: DOMException | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  result: string | null = null;

  readAsDataURL() {
    this.result = 'data:text/plain;base64,Zm9v';
    this.onload?.();
  }

  readAsText() {
    this.result = 'text-payload';
    this.onload?.();
  }
}

class EmptyResultFileReader extends SuccessfulFileReader {
  override readAsDataURL() {
    this.result = null;
    this.onload?.();
  }

  override readAsText() {
    this.result = null;
    this.onload?.();
  }
}

class FailedFileReader {
  error = new DOMException('failed');
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  result: string | null = null;

  readAsDataURL() {
    this.onerror?.();
  }

  readAsText() {
    this.onerror?.();
  }
}

const demoFile = new File(['demo'], 'demo.txt');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editor-file-actions.file-reader', () => {
  it('resolves text and data-url payloads from load events', async () => {
    vi.stubGlobal('FileReader', SuccessfulFileReader);

    await expect(
      Promise.all([readFileAsText(demoFile), readFileAsDataUrl(demoFile)])
    ).resolves.toEqual(['text-payload', 'data:text/plain;base64,Zm9v']);
  });

  it('normalizes null reader results to empty strings', async () => {
    vi.stubGlobal('FileReader', EmptyResultFileReader);

    await expect(
      Promise.all([readFileAsText(demoFile), readFileAsDataUrl(demoFile)])
    ).resolves.toEqual(['', '']);
  });

  it('rejects with the underlying reader error for both read modes', async () => {
    vi.stubGlobal('FileReader', FailedFileReader);

    await expect(readFileAsText(demoFile)).rejects.toBeInstanceOf(DOMException);
    await expect(readFileAsDataUrl(demoFile)).rejects.toBeInstanceOf(DOMException);
  });
});
