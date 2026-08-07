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

    expect(style.bottom).toBe(0);
    expect(style.left).toBe('75%');
    expect(style.transform).toBe('translate(-50%, 50%) translate(0px, 0px)');

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
    expect({ bottom: thickStyle.bottom, left: thickStyle.left }).toEqual({
      bottom: 0,
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

    expect(style.transform).toBe('translate(-50%, 50%) translate(7.2px, 0px)');
  });

  it('renders a custom diameter and semantic frame colors without changing placement', () => {
    const style = getStepBadgeStyle({
      borderColor: '#123456',
      borderWidth: 4,
      clickable: false,
      fillColor: '#fedcba',
      fillOpacity: 1,
      settings: {
        anchor: 'middle-right',
        enabled: true,
        style: {
          backgroundColor: '#ffffff',
          backgroundColorSource: 'frame-fill',
          diameter: 40,
          outlineColor: '#000000',
          outlineColorSource: 'frame-border',
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
      border: '2px solid #123456',
      color: '#123456',
      height: '40px',
      right: 0,
      top: '50%',
      width: '40px',
    });
  });

  it('projects free pointer movement onto one exact frame border', () => {
    const placement = projectStepBadgeToFrameBoundary({
      frameRect,
      point: { x: 238, y: 52 },
    });

    expect(placement).toEqual({ position: 0.69, side: 'top' });
    expect(getStepBadgeBoundaryCenter(frameRect, placement)).toEqual({ x: 238, y: 80 });
  });

  it('uses a corner dead zone to avoid switching sides for tiny pointer movements', () => {
    expect(
      projectStepBadgeToFrameBoundary({
        frameRect,
        point: { x: 302, y: 78 },
        previousSide: 'right',
      })
    ).toEqual({ position: 0, side: 'right' });
  });
});
