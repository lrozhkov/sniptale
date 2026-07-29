// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sanitizeMock = vi.hoisted(() => vi.fn());

vi.mock('dompurify', () => ({
  default: {
    sanitize: sanitizeMock,
  },
}));

function createChromiumStyleDeclaration(style: string) {
  const declarations = style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':');
      return [
        declaration.slice(0, separatorIndex).trim(),
        declaration.slice(separatorIndex + 1).trim(),
      ] as const;
    });

  return Object.assign(
    {
      getPropertyValue(property: string) {
        return declarations.find(([name]) => name === property)?.[1] ?? '';
      },
      length: declarations.length,
    },
    Object.fromEntries(declarations.map(([property], index) => [index, property]))
  );
}

function createSanitizedContainer(style: string) {
  const wrapper = document.createElement('section');
  const div = document.createElement('div');
  Object.defineProperty(div, 'style', {
    configurable: true,
    value: createChromiumStyleDeclaration(style),
  });
  wrapper.append(div);
  return wrapper;
}

beforeEach(() => {
  sanitizeMock.mockReset();
  sanitizeMock.mockImplementation((dirtyHtml: string) => {
    const styleMatch = dirtyHtml.match(/style="([^"]*)"/);
    return createSanitizedContainer(styleMatch?.[1] ?? '');
  });
});

describe('frame custom-css decoration projection', () => {
  it('rejects Chromium-prefixed geometry aliases from the real css validation flow', async () => {
    const { validateCssString } = await import('../css-sanitizer/css');
    const { projectFrameDecorationCssStyles } = await import('./decoration');
    const validation = validateCssString(
      [
        '-webkit-transform: scale(2)',
        '-webkit-clip-path: inset(10px)',
        '-webkit-mask: linear-gradient(black, transparent)',
        'background-image: linear-gradient(red, blue)',
        'box-shadow: 0 0 4px red',
      ].join('; ')
    );

    expect(validation.styles).toMatchObject({
      WebkitClipPath: 'inset(10px)',
      WebkitMask: 'linear-gradient(black, transparent)',
      WebkitTransform: 'scale(2)',
    });
    expect(projectFrameDecorationCssStyles(validation.styles)).toEqual({
      backgroundImage: 'linear-gradient(red, blue)',
      boxShadow: '0 0 4px red',
    });
  });

  it('normalizes every supported JavaScript vendor prefix before classification', async () => {
    const { projectFrameDecorationCssStyles } = await import('./decoration');

    expect(
      projectFrameDecorationCssStyles({
        MozTransform: 'scale(2)',
        msTransform: 'scale(2)',
        OTransform: 'scale(2)',
        WebkitFontSmoothing: 'antialiased',
      })
    ).toEqual({ WebkitFontSmoothing: 'antialiased' });
  });
});
