import type { EffectV1Command, EffectV1PathSegment } from '@sniptale/runtime-contracts/effect-v1';

import { n, type RenderState } from './model.js';

type PathCommand = Extract<EffectV1Command, { op: 'path' }>;
type Segment<Kind extends EffectV1PathSegment['kind']> = Extract<
  EffectV1PathSegment,
  { kind: Kind }
>;

export function drawCanvasPathSegments(command: PathCommand, state: RenderState): void {
  if (!command.segments) return;
  state.context.beginPath();
  for (const segment of command.segments) drawSegment(segment, state);
  if (command.closed) state.context.closePath();
}

function drawSegment(segment: EffectV1PathSegment, state: RenderState): void {
  const context = state.context;
  if (segment.kind === 'moveTo') context.moveTo(n(segment.x, state), n(segment.y, state));
  else if (segment.kind === 'lineTo') context.lineTo(n(segment.x, state), n(segment.y, state));
  else if (segment.kind === 'quadraticTo') drawQuadratic(segment, state);
  else if (segment.kind === 'cubicTo') drawCubic(segment, state);
  else if (segment.kind === 'arc') drawArc(segment, state);
  else if (segment.kind === 'ellipse') drawEllipse(segment, state);
  else if (segment.kind === 'rect') drawRect(segment, state);
  else if (segment.kind === 'roundRect') drawRoundRect(segment, state);
}

function drawQuadratic(segment: Segment<'quadraticTo'>, state: RenderState): void {
  state.context.quadraticCurveTo(
    n(segment.cpx, state),
    n(segment.cpy, state),
    n(segment.x, state),
    n(segment.y, state)
  );
}

function drawCubic(segment: Segment<'cubicTo'>, state: RenderState): void {
  state.context.bezierCurveTo(
    n(segment.cp1x, state),
    n(segment.cp1y, state),
    n(segment.cp2x, state),
    n(segment.cp2y, state),
    n(segment.x, state),
    n(segment.y, state)
  );
}

function drawArc(segment: Segment<'arc'>, state: RenderState): void {
  state.context.arc(
    n(segment.centerX, state),
    n(segment.centerY, state),
    n(segment.radius, state),
    n(segment.start, state),
    n(segment.end, state),
    segment.counterclockwise === true
  );
}

function drawEllipse(segment: Segment<'ellipse'>, state: RenderState): void {
  state.context.ellipse(
    n(segment.centerX, state),
    n(segment.centerY, state),
    n(segment.radiusX, state),
    n(segment.radiusY, state),
    n(segment.rotation, state),
    n(segment.start, state),
    n(segment.end, state),
    segment.counterclockwise === true
  );
}

function drawRect(segment: Segment<'rect'>, state: RenderState): void {
  state.context.rect(
    n(segment.x, state),
    n(segment.y, state),
    n(segment.width, state),
    n(segment.height, state)
  );
}

function drawRoundRect(segment: Segment<'roundRect'>, state: RenderState): void {
  state.context.roundRect(
    n(segment.x, state),
    n(segment.y, state),
    n(segment.width, state),
    n(segment.height, state),
    n(segment.radius, state)
  );
}
