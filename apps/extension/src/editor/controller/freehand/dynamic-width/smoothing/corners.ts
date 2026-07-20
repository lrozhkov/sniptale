import { clamp, type DynamicStrokePoint } from '../types';

export function isSharpCorner(
  previous: DynamicStrokePoint,
  current: DynamicStrokePoint,
  next: DynamicStrokePoint
): boolean {
  const incomingX = previous.x - current.x;
  const incomingY = previous.y - current.y;
  const outgoingX = next.x - current.x;
  const outgoingY = next.y - current.y;
  const incomingLength = Math.hypot(incomingX, incomingY);
  const outgoingLength = Math.hypot(outgoingX, outgoingY);
  if (incomingLength <= 0 || outgoingLength <= 0) {
    return false;
  }

  const cosine = clamp(
    (incomingX * outgoingX + incomingY * outgoingY) / incomingLength / outgoingLength,
    -1,
    1
  );
  return Math.acos(cosine) <= Math.PI / 2;
}
