import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  appendBackupBlobEntry,
  appendBackupTextEntry,
  createBackupExportBudget,
  generateBackupZipBlob,
  MAX_BACKUP_EXPORT_GENERATION_BYTES,
} from './budget';
import { createSizedBackupTestBlob } from './budget.test-support.ts';
import { MAX_BACKUP_ARCHIVE_BYTES, MAX_BACKUP_ENTRY_BYTES } from '../../manifest';

describe('media hub backup export entry budget', () => {
  it('rejects oversized entries before writing them to the zip', () => {
    const zip = new RecordingJSZip();

    expect(() =>
      appendBackupBlobEntry({
        blob: createSizedBackupTestBlob(MAX_BACKUP_ENTRY_BYTES + 1),
        budget: createBackupExportBudget(),
        label: 'asset oversized',
        path: 'assets/oversized',
        zip,
      })
    ).toThrow('Media hub backup entry exceeds byte budget');
    expect(zip.entries.size).toBe(0);
  });

  it('rejects packages that exceed the aggregate inflated byte budget', () => {
    const zip = new RecordingJSZip();
    const budget = createBackupExportBudget();
    const chunk = createSizedBackupTestBlob(MAX_BACKUP_ENTRY_BYTES);
    const acceptedChunks = Math.floor(MAX_BACKUP_EXPORT_GENERATION_BYTES / MAX_BACKUP_ENTRY_BYTES);

    for (let index = 0; index < acceptedChunks; index += 1) {
      appendBackupBlobEntry({
        blob: chunk,
        budget,
        label: `asset ${index}`,
        path: `assets/${index}`,
        zip,
      });
    }

    const overflowBytes = MAX_BACKUP_EXPORT_GENERATION_BYTES - budget.totalBytes + 1;
    expect(() =>
      appendBackupBlobEntry({
        blob: createSizedBackupTestBlob(overflowBytes),
        budget,
        label: 'asset overflow',
        path: 'assets/overflow',
        zip,
      })
    ).toThrow('Media hub backup package exceeds total byte budget');
    expect(zip.entries.size).toBe(acceptedChunks);
    expect(zip.entries.has('assets/overflow')).toBe(false);
  });
});

describe('media hub backup export package contract', () => {
  it('keeps the export generation budget below the import archive cap', () => {
    expect(MAX_BACKUP_EXPORT_GENERATION_BYTES).toBeLessThan(MAX_BACKUP_ARCHIVE_BYTES);
  });

  it('rejects generated archives that exceed the import archive cap', async () => {
    const zip = new RecordingZipGenerator(undefined, MAX_BACKUP_ARCHIVE_BYTES + 1);

    await expect(
      generateBackupZipBlob({
        budget: createBackupExportBudget(),
        zip,
      })
    ).rejects.toThrow('Media hub backup package exceeds archive byte budget.');
    expect(zip.generated).toBe(true);
  });

  it('rejects JSON text entries that exceed the importer JSON cap before writing', () => {
    const zip = new RecordingJSZip();

    expect(() =>
      appendBackupTextEntry({
        budget: createBackupExportBudget(),
        label: 'metadata.json',
        maxBytes: 2,
        path: 'metadata.json',
        text: 'oversized',
        zip,
      })
    ).toThrow('Media hub backup JSON entry exceeds byte budget');
    expect(zip.entries.has('metadata.json')).toBe(false);
  });
});

describe('media hub backup export cancellation budget', () => {
  it('rejects cancelled export before archive generation starts', async () => {
    const zip = new RecordingZipGenerator();
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      generateBackupZipBlob({
        budget: createBackupExportBudget(),
        signal: abortController.signal,
        zip,
      })
    ).rejects.toThrow('Media hub backup export was cancelled.');
    expect(zip.generated).toBe(false);
  });

  it('checks cancellation during archive generation progress', async () => {
    const zip = new RecordingZipGenerator(() => {
      zip.abortController.abort();
    });

    await expect(
      generateBackupZipBlob({
        budget: createBackupExportBudget(),
        signal: zip.abortController.signal,
        zip,
      })
    ).rejects.toThrow('Media hub backup export was cancelled.');
    expect(zip.generated).toBe(true);
  });

  it('checks cancellation after archive generation resolves', async () => {
    const zip = new RecordingZipGenerator(undefined, 3, 'abort-before-return');

    await expect(
      generateBackupZipBlob({
        budget: createBackupExportBudget(),
        signal: zip.abortController.signal,
        zip,
      })
    ).rejects.toThrow('Media hub backup export was cancelled.');
    expect(zip.generated).toBe(true);
  });
});

class RecordingJSZip extends JSZip {
  readonly entries = new Set<string>();

  override file(path: string): JSZip.JSZipObject | null;
  override file(path: RegExp): JSZip.JSZipObject[];
  override file(path: string, data: unknown, options?: JSZip.JSZipFileOptions): this;
  override file(path: string, data: null, options?: JSZip.JSZipFileOptions & { dir: true }): this;
  override file(
    path: string | RegExp,
    data?: unknown
  ): JSZip.JSZipObject | JSZip.JSZipObject[] | null | this {
    if (path instanceof RegExp) {
      return [];
    }
    if (data === undefined) {
      return null;
    }
    this.entries.add(path);
    return this;
  }
}

class RecordingZipGenerator {
  readonly abortController = new AbortController();
  generated = false;

  constructor(
    private readonly onUpdate?: () => void,
    private readonly generatedSize = 3,
    private readonly mode: 'normal' | 'abort-before-return' = 'normal'
  ) {}

  async generateAsync(_options: { type: 'blob' }, onUpdate?: () => void): Promise<Blob> {
    this.generated = true;
    this.onUpdate?.();
    onUpdate?.();
    if (this.mode === 'abort-before-return') {
      this.abortController.abort();
    }
    return createSizedBackupTestBlob(this.generatedSize);
  }
}
