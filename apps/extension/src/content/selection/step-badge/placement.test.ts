import { describe, expect, it } from 'vitest';
import {
  getStepBadgeBoundaryCenter,
  projectStepBadgeToFrameBoundary,
} from '../../../features/highlighter/frame-annotation/step-badge/placement';
import { getStepBadgeStyle } from '../../../features/highlighter/frame-annotation/step-badge-surface';

const frameRect = { x: 100, y: 80, width: 200, height: 120 };

describe('step badge boundary placement', () => {
  it('keeps a manual badge center mathematically on the selected border axis', () => {
    expect(getStepBadgeBoundaryCenter(frameRect, { position: 0.25, side: 'bottom' })).toEqual({
      x: 150,
      y: 200,
    });
    expect(getStepBadgeBoundaryCenter(frameRect, { position: 0.75, side: 'left' })).toEqual({
      x: 100,
      y: 170,
    });
    expect(
      getStepBadgeBoundaryCenter(frameRect, {
        normalOffset: 24,
        position: 0.25,
        side: 'bottom',
      })
    ).toEqual({ x: 150, y: 224 });
    expect(
      getStepBadgeBoundaryCenter(frameRect, {
        normalOffset: -18,
        position: 0.75,
        side: 'left',
      })
    ).toEqual({ x: 118, y: 170 });
  });

  it('maps the normalized position to the canonical frame boundary independent of stroke width', () => {
    const style = getStepBadgeStyle({
      borderColor: '#111',
      borderWidth: 4,
      clickable: false,
      settings: {
        enabled: true,
        manualPlacement: { position: 0.75, side: 'bottom' },
        type: 'number',
        value: '4',
      },
      zIndex: 10,
    });

    expect(style.top).toBe('100%');
    expect(style.left).toBe('75%');
    expect(style.transform).toBe(
      'translate(-14.580000000000004px, -14.580000000000004px) scale(1)'
    );

    const thickStyle = getStepBadgeStyle({
      borderColor: '#111',
      borderWidth: 20,
      clickable: false,
      settings: {
        enabled: true,
        manualPlacement: { position: 0.75, side: 'bottom' },
        type: 'number',
        value: '4',
      },
      zIndex: 10,
    });
    expect({ top: thickStyle.top, left: thickStyle.left }).toEqual({
      top: '100%',
      left: '75%',
    });
  });

  it('keeps the configured visual offset after the badge is moved manually', () => {
    const style = getStepBadgeStyle({
      borderColor: '#111',
      borderWidth: 4,
      clickable: false,
      settings: {
        enabled: true,
        manualPlacement: { position: 0.75, side: 'bottom' },
        offsetDirections: ['right'],
        size: 'standard',
        type: 'number',
        value: '4',
      },
      zIndex: 10,
    });

    expect(style.transform).toBe('translate(-3.6000000000000005px, -10.8px) scale(1)');
  });

  it('compensates the visual offset together with the badge at page zoom', () => {
    const style = getStepBadgeStyle({
      borderColor: '#111',
      borderWidth: 4,
      clickable: false,
      settings: {
        enabled: true,
        manualPlacement: { position: 0.75, side: 'bottom' },
        offsetDirections: ['right'],
        size: 'standard',
        type: 'number',
        value: '4',
      },
      visualScale: 0.5,
      zIndex: 10,
    });

    expect(style.transform).toBe('translate(-1.8000000000000003px, -5.4px) scale(0.5)');
    expect(style.scale).toBeUndefined();
  });

  it('renders a custom diameter and semantic frame colors without changing placement', () => {
    const style = getStepBadgeStyle({
      borderColor: '#123456',
      borderWidth: 4,
      clickable: false,
      fillColor: '#fedcba',
      settings: {
        anchor: 'middle-right',
        enabled: true,
        style: {
          backgroundColor: '#ffffff',
          backgroundColorSource: 'frame-fill',
          diameter: 40,
          outlineColor: '#000000',
          outlineColorSource: 'frame-border',
          outlineWidth: 5,
          sizeSource: 'custom',
          textColor: '#000000',
          textColorSource: 'frame-border',
        },
        type: 'number',
        value: '4',
      },
      zIndex: 10,
    });

    expect(style).toMatchObject({
      backgroundColor: '#fedcba',
      border: '5px solid #123456',
      color: '#123456',
      height: '40px',
      left: '100%',
      top: '50%',
      width: '40px',
    });
  });

  it('projects free pointer movement into the anchored offset strip', () => {
    const placement = projectStepBadgeToFrameBoundary({
      frameRect,
      point: { x: 238, y: 52 },
    });

    expect(placement).toEqual({ normalOffset: 28, position: 0.69, side: 'top' });
    expect(getStepBadgeBoundaryCenter(frameRect, placement)).toEqual({ x: 238, y: 52 });
  });

  it('preserves the anchored side and clamps inward and outward movement', () => {
    expect(
      projectStepBadgeToFrameBoundary({
        frameRect,
        point: { x: 302, y: 78 },
        previousSide: 'right',
      })
    ).toEqual({ normalOffset: 2, position: 0, side: 'right' });
    expect(
      projectStepBadgeToFrameBoundary({
        frameRect,
        point: { x: 20, y: 140 },
        previousSide: 'right',
      })
    ).toEqual({ normalOffset: -48, position: 0.5, side: 'right' });
    expect(
      projectStepBadgeToFrameBoundary({
        frameRect,
        point: { x: 400, y: 140 },
        previousSide: 'right',
      })
    ).toEqual({ normalOffset: 48, position: 0.5, side: 'right' });
  });

  it('renders signed normal offsets consistently at page zoom', () => {
    const style = getStepBadgeStyle({
      borderColor: '#111',
      borderWidth: 4,
      clickable: false,
      settings: {
        enabled: true,
        manualPlacement: { normalOffset: 20, position: 0.75, side: 'bottom' },
        type: 'number',
        value: '4',
      },
      visualScale: 0.5,
      zIndex: 10,
    });

    expect(style.transform).toBe(
      'translate(-7.290000000000002px, 12.709999999999997px) scale(0.5)'
    );
  });
});
