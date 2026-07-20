// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sanitizeMock = vi.hoisted(() => vi.fn());

vi.mock('dompurify', () => ({
  default: {
    sanitize: sanitizeMock,
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

function createSanitizedContainer(style: string) {
  const wrapper = document.createElement('section');
  const div = document.createElement('div');

  div.setAttribute('style', style);
  wrapper.append(div);

  return wrapper;
}

beforeEach(() => {
  sanitizeMock.mockReset();
  sanitizeMock.mockImplementation((dirtyHtml: string) => {
    if (dirtyHtml.includes('throw-error')) {
      throw new Error('css parse failed');
    }

    if (dirtyHtml.includes('throw-string')) {
      throw 'css exploded';
    }

    if (dirtyHtml.includes('no-div')) {
      return document.createElement('section');
    }

    const styleMatch = dirtyHtml.match(/style="([^"]*)"/);
    return createSanitizedContainer(styleMatch?.[1] ?? '');
  });
});

describe('css-sanitizer validateCssString', () => {
  it('reports blocked props while preserving safe styles', async () => {
    const { validateCssString } = await import('./css');

    expect(
      validateCssString('font-size: 16px; margin-top: 10px; padding-left: 4px; color: green;')
    ).toEqual({
      blockedProps: ['margin-top', 'padding-left'],
      hasBlockedProps: true,
      rawError: null,
      styles: {
        color: 'green',
        fontSize: '16px',
      },
    });
  });
});

describe('css-sanitizer parse failures', () => {
  it('surfaces recognition failures and parse errors', async () => {
    const { validateCssString } = await import('./css');

    expect(validateCssString('no-div')).toEqual({
      blockedProps: [],
      hasBlockedProps: false,
      rawError: 'shared.runtime.cssRecognitionFailed',
      styles: {},
    });
    expect(validateCssString('throw-error')).toEqual({
      blockedProps: [],
      hasBlockedProps: false,
      rawError: 'shared.runtime.cssRecognitionFailed',
      styles: {},
    });
    expect(validateCssString('throw-string')).toEqual({
      blockedProps: [],
      hasBlockedProps: false,
      rawError: 'shared.runtime.cssRecognitionFailed',
      styles: {},
    });
  });
});

describe('css-sanitizer empty input', () => {
  it('returns an empty success payload for empty css input', async () => {
    const { validateCssString } = await import('./css');

    expect(validateCssString('')).toEqual({
      blockedProps: [],
      hasBlockedProps: false,
      rawError: null,
      styles: {},
    });
  });
});
