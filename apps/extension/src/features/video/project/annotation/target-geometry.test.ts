import { expect, it } from 'vitest';
import { createAnnotationClip } from './template';
import { createEmptyVideoProject } from '../factories/creation';
import {
  resolveAnnotationConnectorGeometry,
  resolveAnnotationFrameBounds,
} from './target-geometry';
import { VideoOverlayTemplateKind } from '../types/index';

it('expands annotation bounds to include target-aware connector geometry', () => {
  const project = createEmptyVideoProject('Geometry', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );

  const bounds = resolveAnnotationFrameBounds(clip, clip.transform);

  expect(bounds.width).toBeGreaterThan(clip.transform.width);
  expect(bounds.height).toBeGreaterThan(clip.transform.height);
  expect(bounds.x).toBeLessThan(clip.transform.x);
});

it('expands bracket-callout bounds to include target frame geometry', () => {
  const project = createEmptyVideoProject('Geometry', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CARD
  );

  const bounds = resolveAnnotationFrameBounds(clip, clip.transform);

  expect(bounds.width).toBeGreaterThan(clip.transform.width);
  expect(bounds.height).toBeGreaterThan(clip.transform.height);
  expect(bounds.x).toBeLessThanOrEqual(clip.transform.x);
});

it('expands spotlight bounds to include focus frame and pulse geometry', () => {
  const project = createEmptyVideoProject('Geometry', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD
  );

  const bounds = resolveAnnotationFrameBounds(clip, clip.transform);

  expect(bounds.width).toBeGreaterThan(clip.transform.width);
  expect(bounds.height).toBeGreaterThan(clip.transform.height);
  expect(bounds.x).toBeLessThan(clip.transform.x);
});

it('resolves marker connector points for point-target pointer labels', () => {
  const project = createEmptyVideoProject('Geometry', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.POINTER_LABEL
  );
  const geometry = resolveAnnotationConnectorGeometry(clip, clip.transform);

  expect(geometry.targetAnchorPoint).toEqual(clip.targetPoint);
  expect(geometry.labelAttachPoint.x).toBeLessThanOrEqual(clip.transform.x + clip.transform.width);
  expect(geometry.bendPoint).toBeNull();
});

it('resolves elbow bend points for rect-target connector callouts', () => {
  const project = createEmptyVideoProject('Geometry', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );
  const geometry = resolveAnnotationConnectorGeometry(clip, clip.transform);

  expect(geometry.targetAnchorPoint).not.toBeNull();
  expect(geometry.bendPoint).not.toBeNull();
  expect(geometry.bendPoint?.x).toBe(geometry.targetAnchorPoint?.x);
});

it('keeps plain annotation bounds unchanged without targets or markers', () => {
  const project = createEmptyVideoProject('Geometry', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC
  );

  expect(resolveAnnotationFrameBounds(clip, clip.transform)).toEqual(clip.transform);
});

it('resolves target anchors across remaining leader-line directions', () => {
  const labelFrame = { height: 80, width: 200, x: 300, y: 120 };
  const clip = {
    calloutDecor: {
      arrowKind: 'NONE',
      frameKind: 'NONE',
      markerKind: 'RING',
      pulseKind: 'NONE',
    },
    leaderLine: {
      direction: 'RIGHT',
      enabled: true,
      length: 120,
      style: 'ELBOW',
      thickness: 3,
    },
    target: 'RECT',
    targetPoint: null,
    targetRect: { height: 60, width: 90, x: 180, y: 150 },
  };

  const rightGeometry = resolveAnnotationConnectorGeometry(clip as never, labelFrame);
  const upGeometry = resolveAnnotationConnectorGeometry(
    { ...clip, leaderLine: { ...clip.leaderLine, direction: 'UP' } } as never,
    labelFrame
  );
  const downGeometry = resolveAnnotationConnectorGeometry(
    { ...clip, leaderLine: { ...clip.leaderLine, direction: 'DOWN' } } as never,
    labelFrame
  );
  const expandedBounds = resolveAnnotationFrameBounds(clip as never, labelFrame);

  expect(rightGeometry.targetAnchorPoint).toEqual({ x: 180, y: 180 });
  expect(upGeometry.targetAnchorPoint).toEqual({ x: 225, y: 210 });
  expect(downGeometry.targetAnchorPoint).toEqual({ x: 225, y: 150 });
  expect(expandedBounds.width).toBeGreaterThan(labelFrame.width);
  expect(expandedBounds.height).toBeGreaterThan(labelFrame.height);
});
