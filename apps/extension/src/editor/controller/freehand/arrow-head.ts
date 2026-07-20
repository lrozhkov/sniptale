import { measureDistance } from './metrics';
import type { FreehandPointRecord } from './points';

export const MIN_ARROW_HEAD_ANGLE = Math.PI * 0.09;
export const MAX_ARROW_HEAD_ANGLE = Math.PI * 0.72;

export function measureSignedDistanceToArrowAxis(
  point: FreehandPointRecord,
  shaftStart: FreehandPointRecord,
  tip: FreehandPointRecord
): number {
  const dx = tip.x - shaftStart.x;
  const dy = tip.y - shaftStart.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return 0;
  }

  return ((point.x - shaftStart.x) * dy - (point.y - shaftStart.y) * dx) / length;
}

export function measureArrowHeadAngle(
  tip: FreehandPointRecord,
  shaftStart: FreehandPointRecord,
  wing: FreehandPointRecord
): number {
  const shaftVector = { x: shaftStart.x - tip.x, y: shaftStart.y - tip.y };
  const wingVector = { x: wing.x - tip.x, y: wing.y - tip.y };
  const shaftLength = Math.hypot(shaftVector.x, shaftVector.y);
  const wingLength = Math.hypot(wingVector.x, wingVector.y);
  if (shaftLength === 0 || wingLength === 0) {
    return 0;
  }

  const cosine =
    (shaftVector.x * wingVector.x + shaftVector.y * wingVector.y) / (shaftLength * wingLength);
  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}

function buildWingPoint(options: {
  angle: number;
  headLength: number;
  shaftStart: FreehandPointRecord;
  tip: FreehandPointRecord;
}) {
  const baseAngle = Math.atan2(
    options.shaftStart.y - options.tip.y,
    options.shaftStart.x - options.tip.x
  );

  return {
    x: options.tip.x + Math.cos(baseAngle + options.angle) * options.headLength,
    y: options.tip.y + Math.sin(baseAngle + options.angle) * options.headLength,
  };
}

export function buildCanonicalArrowHead(options: {
  leftWing: FreehandPointRecord;
  rightWing: FreehandPointRecord;
  shaftStart: FreehandPointRecord;
  tip: FreehandPointRecord;
}) {
  const leftLength = measureDistance(options.leftWing, options.tip);
  const rightLength = measureDistance(options.rightWing, options.tip);
  const leftAngle = measureArrowHeadAngle(options.tip, options.shaftStart, options.leftWing);
  const rightAngle = measureArrowHeadAngle(options.tip, options.shaftStart, options.rightWing);
  const headLength = Math.max(1, (leftLength + rightLength) / 2);
  const headAngle = Math.max(
    MIN_ARROW_HEAD_ANGLE,
    Math.min(MAX_ARROW_HEAD_ANGLE, (leftAngle + rightAngle) / 2)
  );
  const leftSign = measureSignedDistanceToArrowAxis(
    options.leftWing,
    options.shaftStart,
    options.tip
  );
  const rightSign = measureSignedDistanceToArrowAxis(
    options.rightWing,
    options.shaftStart,
    options.tip
  );
  const positiveWing = buildWingPoint({
    angle: headAngle,
    headLength,
    shaftStart: options.shaftStart,
    tip: options.tip,
  });
  const negativeWing = buildWingPoint({
    angle: -headAngle,
    headLength,
    shaftStart: options.shaftStart,
    tip: options.tip,
  });

  return leftSign >= rightSign
    ? {
        left: positiveWing,
        right: negativeWing,
      }
    : {
        left: negativeWing,
        right: positiveWing,
      };
}
