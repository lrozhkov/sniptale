import { describe, expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { getCalloutTitleMeasureStyle, getCalloutTitleStyle } from './title-style';

const style = createSystemCalloutPresetCatalog()[0]!.style;

describe('getCalloutTitleStyle', () => {
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

  it('retains the regular CSS-border geometry without a shared wedge outline', () => {
    const regularStyle = {
      ...style,
      surface: { ...style.surface, borderWidth: 8, paddingX: 12, paddingY: 16, radius: 20 },
    };

    expect(getCalloutTitleStyle(regularStyle, false)).toMatchObject({
      borderRadius: '20px 20px 0 0',
      marginLeft: -12,
      marginRight: -12,
      marginTop: -16,
      width: 'calc(100% + 24px)',
    });
  });

  it('renders the configured separator between the title and body', () => {
    const dividedStyle = {
      ...style,
      title: {
        ...style.title,
        dividerColor: '#2563eb',
        dividerStyle: 'dashed' as const,
        dividerWidth: 3,
      },
    };

    expect(getCalloutTitleStyle(dividedStyle, false)).toMatchObject({
      borderBottom: '3px dashed #2563eb',
    });
  });

  it('keeps body typography out of the title and its width measurement', () => {
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
      fontStyle: 'normal',
      textAlign: 'left',
      textDecoration: 'none',
    });
  });

  it('lets the real title text contribute width without contributing height', () => {
    expect(getCalloutTitleMeasureStyle(style)).toMatchObject({
      alignItems: 'center',
      display: 'flex',
      gap: 6,
      height: 0,
      lineHeight: 0,
      overflow: 'hidden',
      visibility: 'hidden',
      whiteSpace: 'pre',
      width: 'max-content',
    });
  });
});
