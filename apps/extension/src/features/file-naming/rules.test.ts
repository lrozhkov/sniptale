import { describe, expect, it } from 'vitest';
import { FILENAME_CATEGORIES, parseFilenameRules, resolveFilename } from './rules';
const context = {
  timestamp: Date.UTC(2026, 8, 26, 12, 30, 45, 123),
  timezoneOffset: -180,
  operationId: 'capture-1',
};
const request = { category: 'images' as const, type: 'screenshot', extension: 'png' };

describe('central filename rules', () => {
  it.each(FILENAME_CATEGORIES)('uses default and category rules for %s', (category) => {
    expect(resolveFilename(undefined, { ...request, category }, context).filename).toBe(
      'Sniptale_screenshot_2026-09-26_15-30-45-123.png'
    );
    expect(
      resolveFilename(
        { template: 'common', [category]: 'custom_{index}' },
        { ...request, category, index: 3 },
        context
      ).filename
    ).toBe('custom_3.png');
    expect(
      resolveFilename({ template: 'common', [category]: ' ' }, { ...request, category }, context)
        .filename
    ).toBe('common.png');
  });
  it.each([
    null,
    { template: '{unknown}' },
    { template: '{title}' },
    { template: '{date' },
    { template: '...  ' },
    { template: 'ok', images: '{broken}' },
  ])('falls back deterministically for %j', (rules) => {
    const result = resolveFilename(rules, request, context);
    expect(result).toEqual(resolveFilename(rules, request, context));
    expect(result.fallback).toBe(true);
    expect(result.filename).toBe('Sniptale_screenshot_2026-09-26T12-30-45-123Z_capture-1_1.png');
  });
  it.each(['CON', 'nul.txt', 'COM1', 'LPT¹'])('protects Windows reserved name %s', (template) => {
    expect(resolveFilename({ template }, request, context).filename).toBe(`_${template}.png`);
  });
  it('sanitizes interpolated titles without interpreting tokens in their values', () => {
    const result = resolveFilename(
      { template: '{title}' },
      { ...request, title: '../folder\\name:<bad>*?\u0000{date}. ' },
      context
    );
    expect(result.filename).toBe('.._folder_name__bad___{date}.png');
  });
  it.each(['sniptale-effect.json', 'sniptale-bundle.zip', 'sniptale-settings.json', 'jpeg'])(
    'preserves full extension %s and UTF-8 length',
    (extension) => {
      const result = resolveFilename(
        { template: '{title}' },
        { ...request, extension, title: '😀'.repeat(200) },
        context
      );
      expect(new TextEncoder().encode(result.filename).length).toBeLessThanOrEqual(200);
      expect(result.filename.endsWith(`.${extension === 'jpeg' ? 'jpg' : extension}`)).toBe(true);
      expect(result.filename).not.toContain('\ufffd');
    }
  );
  it('keeps track suffixes distinct with a constant template', () => {
    const names = ['window-1', 'window-2', 'webcam', 'microphone'].map(
      (suffix) =>
        resolveFilename({ template: 'session' }, { ...request, extension: 'webm', suffix }, context)
          .filename
    );
    expect(new Set(names).size).toBe(4);
    expect(names).toContain('session_webcam.webm');
  });
  it('uses a fixed safe context when fallback metadata is unavailable', () => {
    expect(
      resolveFilename(null, request, { timestamp: NaN, timezoneOffset: Infinity, operationId: '' })
        .filename
    ).toBe('Sniptale_screenshot_1970-01-01T00-00-00-000Z_operation_1.png');
  });
  it('strictly rejects malformed or oversized imported rule fields', () => {
    expect(parseFilenameRules({ template: 'ok', recordings: 4 })).toBeNull();
    expect(parseFilenameRules({ template: 'a'.repeat(201) })).toBeNull();
    expect(parseFilenameRules({ template: '', images: '' })).toEqual({ template: '', images: '' });
  });
});
