import { expect, it } from 'vitest';
import { resolveAnnotationTemplateDefaults } from './defaults';
import { VideoOverlayTemplateKind } from '../types/index';

it('resolves target-aware defaults for pointer and bracket-callout templates', () => {
  const calloutCardDefaults = resolveAnnotationTemplateDefaults(
    1280,
    720,
    VideoOverlayTemplateKind.CALLOUT_CARD
  );
  const pointerDefaults = resolveAnnotationTemplateDefaults(
    1280,
    720,
    VideoOverlayTemplateKind.POINTER_LABEL
  );
  expect(pointerDefaults).toEqual(
    expect.objectContaining({
      annotationFamily: 'POINTER',
      motionFamily: 'MARKER_POP',
      renderFamily: 'MARKER',
      target: 'POINT',
    })
  );
  expect(pointerDefaults.targetPoint).not.toBeNull();
  expect(pointerDefaults.leaderLine.enabled).toBe(true);
  expect(calloutCardDefaults).toEqual(
    expect.objectContaining({
      annotationFamily: 'CALLOUT',
      motionFamily: 'FRAME_TRACE',
      renderFamily: 'FRAME',
      target: 'RECT',
    })
  );
  expect(calloutCardDefaults.targetRect).not.toBeNull();
  expect(calloutCardDefaults.calloutDecor.frameKind).toBe('BRACKET');
});

it('resolves target-aware defaults for connector and spotlight annotation templates', () => {
  const connectorDefaults = resolveAnnotationTemplateDefaults(
    1280,
    720,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );
  const spotlightDefaults = resolveAnnotationTemplateDefaults(
    1280,
    720,
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD
  );

  expect(connectorDefaults).toEqual(
    expect.objectContaining({
      annotationFamily: 'CALLOUT',
      motionFamily: 'CONNECTOR_DRAW',
      renderFamily: 'LINE',
      target: 'RECT',
    })
  );
  expect(connectorDefaults.targetRect).not.toBeNull();
  expect(connectorDefaults.calloutDecor.frameKind).toBe('ROUNDED_RECT');
  expect(spotlightDefaults).toEqual(
    expect.objectContaining({
      annotationFamily: 'SPOTLIGHT',
      motionFamily: 'PULSE_SPOTLIGHT',
      renderFamily: 'SPOTLIGHT',
      target: 'RECT',
    })
  );
  expect(spotlightDefaults.targetRect).not.toBeNull();
  expect(spotlightDefaults.calloutDecor.pulseKind).toBe('RING');
});

it('resolves target-aware defaults for notification and scan-frame templates', () => {
  const notificationDefaults = resolveAnnotationTemplateDefaults(
    1280,
    720,
    VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER
  );
  const scanDefaults = resolveAnnotationTemplateDefaults(
    1280,
    720,
    VideoOverlayTemplateKind.FOCUS_SCAN_FRAME
  );

  expect(notificationDefaults).toEqual(
    expect.objectContaining({
      annotationFamily: 'CALLOUT',
      motionFamily: 'FRAME_TRACE',
      renderFamily: 'FRAME',
      target: 'RECT',
    })
  );
  expect(notificationDefaults.targetRect).not.toBeNull();
  expect(notificationDefaults.calloutDecor.markerKind).toBe('DOT');
  expect(scanDefaults).toEqual(
    expect.objectContaining({
      annotationFamily: 'SPOTLIGHT',
      motionFamily: 'PULSE_SPOTLIGHT',
      renderFamily: 'SPOTLIGHT',
      target: 'RECT',
    })
  );
  expect(scanDefaults.targetRect).not.toBeNull();
  expect(scanDefaults.calloutDecor.frameKind).toBe('BRACKET');
});

it('resolves side reveal panel defaults as a full-height left-edge scene reveal', () => {
  const defaults = resolveAnnotationTemplateDefaults(
    1200,
    600,
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL
  );

  expect(defaults.transform).toEqual(
    expect.objectContaining({ height: 600, width: 408, x: 0, y: 0 })
  );
  expect(defaults.direction).toBe('LEFT');
  expect(defaults.content.headline).toBe('Новая сцена');
});
