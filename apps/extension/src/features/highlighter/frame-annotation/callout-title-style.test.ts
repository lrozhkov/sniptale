import { describe, expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../callout-presets/catalog';
import {
  getFrameCalloutTitleMeasureStyle as getCalloutTitleMeasureStyle,
  getFrameCalloutTitleStyle as getCalloutTitleStyle,
} from './callout-title-style';
import { resolveFrameCalloutFontFamily } from './callout/font-family';

const style = createSystemCalloutPresetCatalog()[0]!.style;

describe('getCalloutTitleStyle', () => {
  it('uses the deterministic shared handwriting family for cursive text', () => {
    expect(resolveFrameCalloutFontFamily('cursive')).toContain('Sniptale Handwritten');
  });
  it('aligns the title background with the inner edge of a shared wedge outline', () => {
    const outlinedStyle = {
      ...style,
      surface: { ...style.surface, borderWidth: 8, paddingX: 12, paddingY: 16, radius: 20 },
    };
    expect(getCalloutTitleStyle(outlinedStyle, true)).toMatchObject({
      borderRadius: '16px 16px 0 0',
      marginLeft: -16,
      marginRight: -16,
      marginTop: -20,
      width: 'calc(100% + 32px)',
    });
  });

  it('retains regular border geometry and configured title presentation', () => {
    const regularStyle = {
      ...style,
      surface: { ...style.surface, borderWidth: 8, paddingX: 12, paddingY: 16, radius: 20 },
      title: {
        ...style.title,
        dividerColor: '#2563eb',
        dividerStyle: 'dashed' as const,
        dividerWidth: 3,
      },
    };
    expect(getCalloutTitleStyle(regularStyle, false)).toMatchObject({
      borderBottom: '3px dashed #2563eb',
      borderRadius: '20px 20px 0 0',
      marginLeft: -12,
      marginRight: -12,
      marginTop: -16,
      width: 'calc(100% + 24px)',
    });
  });

  it('keeps title typography independent and measures text without height', () => {
    const decoratedBodyStyle = {
      ...style,
      typography: {
        ...style.typography,
        fontFamily: 'serif' as const,
        fontStyle: 'italic' as const,
        textAlign: 'center' as const,
        textDecoration: 'underline' as const,
      },
    };
    expect(getCalloutTitleStyle(decoratedBodyStyle, false)).toMatchObject({
      fontStyle: 'normal',
      textAlign: 'left',
      textDecoration: 'none',
    });
    expect(getCalloutTitleMeasureStyle(decoratedBodyStyle)).toMatchObject({
      display: 'flex',
      fontStyle: 'normal',
      height: 0,
      lineHeight: 0,
      textAlign: 'left',
      textDecoration: 'none',
      visibility: 'hidden',
      whiteSpace: 'pre',
      width: 'max-content',
    });
  });
});
