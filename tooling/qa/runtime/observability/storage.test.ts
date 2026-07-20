import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createTempRoot } from '../../core/test-helpers';
import { sanitizeLogText } from './sanitize.mjs';
import { appendBoundedLog, writeJsonAtomic } from './storage.mjs';

describe('observability log sanitization', () => {
  it('sanitizes paths, credentials, tokens, control codes and ANSI sequences', () => {
    const source = [
      '\u001b[31mfailed\u001b[0m',
      'Authorization: Bearer private-bearer',
      'Proxy-Authorization: Basic private-proxy',
      'Cookie: session=private-cookie',
      'Set-Cookie: refresh=private-refresh; Secure',
      'api_key=private-key',
      '{"apiKey":"json-private-key","Authorization":"Bearer json-bearer"}',
      '{\n  "clientSecret": "json-client-secret",\n  "refreshToken": "json-refresh-token"\n}',
      'https://user:password@example.test/path?token=private-query',
      'https://example.test/object?X-Amz-Signature=private-signature&x-amz-credential=private-credential',
      'github_pat_abcdefghijklmnopqrstuvwxyz123456',
      '/home/alice/work/file.ts',
      'C:\\Users\\Alice\\private.txt',
      '\u0000',
    ].join('\n');
    const sanitized = sanitizeLogText(source, { repositoryRoot: '/repo' });

    expect(sanitized).toContain('Authorization: <redacted>');
    expect(sanitized).toContain('Proxy-Authorization: <redacted>');
    expect(sanitized).toContain('Cookie: <redacted>');
    expect(sanitized).toContain('Set-Cookie: <redacted>');
    expect(sanitized).toContain('api_key=<redacted>');
    expect(sanitized).not.toMatch(/private|password|Alice|alice|json-bearer/u);
    expect(sanitized).not.toContain('\u001b');
    expect(sanitized).not.toContain('\u0000');
  });
});

describe('observability storage', () => {
  it('bounds UTF-8 logs and writes the truncation marker once', () => {
    const root = createTempRoot('qa-observability-log-');
    const logPath = path.join(root, '.tmp/qa-logs/run.log');
    const first = appendBoundedLog(logPath, '🙂'.repeat(100), {
      maximumBytes: 96,
      repositoryRoot: root,
    });
    const second = appendBoundedLog(logPath, 'must-not-be-written', {
      maximumBytes: 96,
      repositoryRoot: root,
    });
    const contents = fs.readFileSync(logPath, 'utf8');

    expect(first.truncated).toBe(true);
    expect(first.byteCount).toBe(Buffer.byteLength(contents));
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.writtenBytes).toBe(0);
    expect(second.digest).toBe(first.digest);
    expect(Buffer.byteLength(contents)).toBeLessThanOrEqual(96);
    expect(contents.match(/log truncated/gu)).toHaveLength(1);
    expect(contents).not.toContain('\ufffd');
  });

  it('replaces JSON records without leaving partial files', () => {
    const root = createTempRoot('qa-observability-atomic-');
    const filePath = path.join(root, '.tmp/qa-observability/runs/run.json');
    writeJsonAtomic(filePath, { version: 1 });
    writeJsonAtomic(filePath, { version: 2 });

    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({ version: 2 });
    expect(fs.readdirSync(path.dirname(filePath))).toEqual(['run.json']);
  });

  it('replaces a bounded log atomically and preserves the prior log on rename failure', () => {
    const root = createTempRoot('qa-observability-atomic-log-');
    const logPath = path.join(root, '.tmp/qa-logs/run.log');
    appendBoundedLog(logPath, 'stable\n', { repositoryRoot: root });
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('injected rename failure');
    });

    expect(() => appendBoundedLog(logPath, 'partial\n', { repositoryRoot: root })).toThrow(
      /injected rename failure/u
    );
    rename.mockRestore();
    expect(fs.readFileSync(logPath, 'utf8')).toBe('stable\n');
    expect(fs.readdirSync(path.dirname(logPath))).toEqual(['run.log']);
  });
});
