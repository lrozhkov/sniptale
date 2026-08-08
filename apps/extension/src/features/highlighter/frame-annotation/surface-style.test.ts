import { describe, expect, it } from 'vitest';
import { getFrameAnnotationFillStyle, getFrameAnnotationStrokeStyle } from './surface-style';

describe('frame annotation surface styles', () => {
  it('keeps fill on the padded inner box and draws the complete stroke outward', () => {
    expect(
      getFrameAnnotationFillStyle({
        borderRadius: 12,
        decorationVisible: true,
        fillColor: '#f97316',
        fillVisible: true,
      })
    ).toMatchObject({ inset: 0, width: '100%', height: '100%', borderRadius: '12px' });

    expect(
      getFrameAnnotationStrokeStyle({
        borderColor: '#f97316',
        borderRadius: 12,
        borderStyle: 'solid',
        borderWidth: 4,
        visible: true,
      })
    ).toMatchObject({
      inset: -4,
      width: 'calc(100% + 8px)',
      height: 'calc(100% + 8px)',
      border: '4px solid #f97316',
      borderRadius: '16px',
    });
  });

  it('keeps stable outward geometry while removing hidden decoration paint', () => {
    expect(
      getFrameAnnotationStrokeStyle({
        borderColor: '#f97316',
        borderRadius: 12,
        borderStyle: 'solid',
        borderWidth: 4,
        visible: false,
      })
    ).toMatchObject({
      inset: -4,
      width: 'calc(100% + 8px)',
      height: 'calc(100% + 8px)',
      border: 'none',
      borderRadius: '16px',
    });
  });

  it('keeps both contours square when corner rounding is zero', () => {
    expect(
      getFrameAnnotationStrokeStyle({
        borderColor: '#f97316',
        borderRadius: 0,
        borderStyle: 'solid',
        borderWidth: 8,
        visible: true,
      }).borderRadius
    ).toBe('0px');
  });
});
