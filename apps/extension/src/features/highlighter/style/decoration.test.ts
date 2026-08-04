// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

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
