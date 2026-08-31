import { describe, expect, it } from 'vitest';
import { parsePopupExportUrls, removePopupExportUrl } from './parser';

describe('popup export URL parser', () => {
  it('recognizes line, comma, semicolon, and unambiguous whitespace separators', () => {
    expect(
      parsePopupExportUrls(
        'example.com/a\nhttps://example.org/b, http://example.net; foo.example bar.example'
      ).urls
    ).toEqual([
      'https://example.com/a',
      'https://example.org/b',
      'http://example.net/',
      'https://foo.example/',
      'https://bar.example/',
    ]);
  });

  it('preserves order, deduplicates, and reports invalid input', () => {
    expect(parsePopupExportUrls('example.com\nhttps://example.com\njavascript:alert(1)')).toEqual({
      invalid: ['javascript:alert(1)'],
      overflowCount: 0,
      urls: ['https://example.com/'],
    });
  });

  it('keeps commas in an explicit URL path', () => {
    expect(parsePopupExportUrls('https://example.com/a,b').urls).toEqual([
      'https://example.com/a,b',
    ]);
  });

  it('removes a recognized address', () => {
    expect(removePopupExportUrl('example.com, example.org', 'https://example.org/')).toBe(
      'https://example.com/'
    );
  });
});

it('retains a valid bare-domain token next to a rejected comma-separated token', () => {
  expect(parsePopupExportUrls('example.com, javascript:alert(1)')).toEqual({
    invalid: ['javascript:alert(1)'],
    overflowCount: 0,
    urls: ['https://example.com/'],
  });
});

it('retains an explicit URL next to a rejected comma-separated token', () => {
  expect(parsePopupExportUrls('https://example.com, javascript:alert(1)')).toEqual({
    invalid: ['javascript:alert(1)'],
    overflowCount: 0,
    urls: ['https://example.com/'],
  });
  expect(parsePopupExportUrls('https://example.com/a,b')).toEqual({
    invalid: [],
    overflowCount: 0,
    urls: ['https://example.com/a,b'],
  });
});
