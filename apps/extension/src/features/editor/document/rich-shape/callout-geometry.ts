import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapePathCommand,
} from './catalog/types';
import type {
  EditorRichShapeCalloutGeometry,
  EditorRichShapeCalloutSide,
  EditorRichShapeDocumentObject,
} from './types';
import { getRichShapeCalloutSidePoint } from './callout-side-point';

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function appendTail(
  commands: EditorBuiltInShapePathCommand[],
  side: EditorRichShapeCalloutSide,
  targetSide: EditorRichShapeCalloutSide,
  tail: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    tip: { x: number; y: number };
  }
): void {
  if (side !== targetSide) {
    return;
  }
  commands.push(['L', round(tail.start.x), round(tail.start.y)]);
  commands.push(['L', round(tail.tip.x), round(tail.tip.y)]);
  commands.push(['L', round(tail.end.x), round(tail.end.y)]);
}

function addRoundedBodyPath(
  commands: EditorBuiltInShapePathCommand[],
  callout: EditorRichShapeCalloutGeometry,
  radius: number
): void {
  const { body, tail } = callout;
  const right = body.left + body.width;
  const bottom = body.top + body.height;
  const r = clamp(radius, 0, Math.min(body.width, body.height) / 2);
  const tailPoints = {
    start: getRichShapeCalloutSidePoint(body, tail.side, tail.baseStartRatio),
    end: getRichShapeCalloutSidePoint(body, tail.side, tail.baseEndRatio),
    tip: tail.tip,
  };

  commands.push(['M', round(body.left + r), round(body.top)]);
  appendTail(commands, 'top', tail.side, tailPoints);
  commands.push(['L', round(right - r), round(body.top)]);
  commands.push(['Q', round(right), round(body.top), round(right), round(body.top + r)]);
  appendTail(commands, 'right', tail.side, tailPoints);
  commands.push(['L', round(right), round(bottom - r)]);
  commands.push(['Q', round(right), round(bottom), round(right - r), round(bottom)]);
  appendTail(commands, 'bottom', tail.side, tailPoints);
  commands.push(['L', round(body.left + r), round(bottom)]);
  commands.push(['Q', round(body.left), round(bottom), round(body.left), round(bottom - r)]);
  appendTail(commands, 'left', tail.side, tailPoints);
  commands.push(['L', round(body.left), round(body.top + r)]);
  commands.push(['Q', round(body.left), round(body.top), round(body.left + r), round(body.top)]);
  commands.push(['Z']);
}

export function createRichShapeCalloutGeometry(
  shape: EditorRichShapeDocumentObject
): EditorBuiltInShapeGeometryDefinition | null {
  if (!shape.callout) {
    return null;
  }

  const commands: EditorBuiltInShapePathCommand[] = [];
  addRoundedBodyPath(commands, shape.callout, shape.style.cornerRadius);
  return {
    type: 'path',
    viewBox: { minX: 0, minY: 0, width: shape.frame.width, height: shape.frame.height },
    textFrame: shape.callout.body,
    paths: [{ commands }],
  };
}
