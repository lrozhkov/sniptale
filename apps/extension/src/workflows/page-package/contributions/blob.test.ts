import { describe, expect, it, vi } from 'vitest';
import { createBlobContribution, normalizeContributionMimeType } from './blob';

describe('Page Package Blob contributions', () => {
  it('normalizes source MIME parameters without reading or replacing Blob bytes', async () => {
    const blob = new Blob(['body'], { type: 'Text/Plain; Charset=UTF-8' });
    const digest = vi.fn().mockResolvedValue('a'.repeat(64));
    expect(normalizeContributionMimeType(blob.type)).toBe('text/plain');
    const contribution = await createBlobContribution({
      blob,
      component: 'pageData',
      digest,
      mimeType: 'text/plain',
      path: 'exports/data/readme.txt',
    });
    expect(contribution).toMatchObject({
      size: 4,
      source: blob,
      sha256: 'a'.repeat(64),
    });
    expect(digest).toHaveBeenCalledWith(blob);
  });

  it('falls back invalid MIME and rejects invalid digest providers', async () => {
    expect(normalizeContributionMimeType('not a mime')).toBe('application/octet-stream');
    await expect(
      createBlobContribution({
        blob: new Blob(['x']),
        component: 'attachments',
        digest: async () => 'sha256:invalid',
        mimeType: 'application/octet-stream',
        path: 'attachments/file.bin',
      })
    ).rejects.toThrow('lowercase SHA-256');
    const digest = vi.fn().mockResolvedValue('a'.repeat(64));
    await expect(
      createBlobContribution({
        blob: new Blob(['x']),
        component: 'attachments',
        digest,
        mimeType: 'not a mime',
        path: '../file.bin',
      })
    ).rejects.toThrow();
    expect(digest).not.toHaveBeenCalled();
  });
});
