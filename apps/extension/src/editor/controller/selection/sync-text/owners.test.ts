import { expect, it } from 'vitest';
import { readTextSelectionAlignment } from './alignment';
import { readTextSelectionColors } from './colors';
import { readTextSelectionShadow } from './shadow';
import { parseFontFamilyForStore, readTextSelectionTypography } from './typography';

const settings = {
  backgroundOpacity: 1,
  fontFamily: 'sans',
  fontSize: 18,
  fontStyle: 'normal',
  fontWeight: 'normal',
  linethrough: false,
  shadowAngle: 45,
  shadowBlur: 18,
  shadowColor: '#222222',
  shadowDistance: 6,
  textColor: '#111111',
  underline: false,
} as never;

it('keeps text alignment normalization in the alignment owner', () => {
  expect(
    readTextSelectionAlignment({
      sniptaleTextVerticalAlign: 'bottom',
      textAlign: 'right',
    } as never)
  ).toEqual({ textAlign: 'right', verticalAlign: 'bottom' });
  expect(readTextSelectionAlignment({ textAlign: 'justify' } as never)).toEqual({
    textAlign: 'left',
    verticalAlign: 'top',
  });
});

it('keeps zero-opacity color recovery in the colors owner', () => {
  expect(
    readTextSelectionColors(
      { fill: 'rgba(18, 52, 86, 0)' } as never,
      settings,
      0,
      0,
      'rgba(255, 204, 0, 0)'
    )
  ).toEqual({
    backgroundColor: '#ffcc00',
    backgroundOpacity: 0,
    textColor: '#123456',
    textOpacity: 0,
  });
});

it('keeps text shadow fallbacks in the shadow owner', () => {
  expect(readTextSelectionShadow({ sniptaleTextShadowBlur: 24 } as never, settings)).toEqual(
    expect.objectContaining({
      shadowAngle: 45,
      shadowBlur: 24,
      shadowColor: '#222222',
      shadowDistance: 6,
    })
  );
});

it('keeps font family and inline style normalization in the typography owner', () => {
  expect(parseFontFamilyForStore('Roboto Mono', 'sans')).toBe('mono');
  expect(parseFontFamilyForStore('Georgia', 'sans')).toBe('serif');
  expect(
    readTextSelectionTypography({ fontStyle: 'italic', underline: true } as never, settings)
  ).toEqual(
    expect.objectContaining({
      fontFamily: 'sans',
      fontSize: 18,
      fontStyle: 'italic',
      underline: true,
    })
  );
});
