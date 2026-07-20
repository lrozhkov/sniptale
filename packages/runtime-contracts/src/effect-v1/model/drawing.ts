import type { EffectV1Expression } from './operations.js';

type ExpressionValue = EffectV1Expression;
export type EffectV1PointValue = { x: ExpressionValue; y: ExpressionValue };

export type EffectV1PathSegment =
  | { kind: 'moveTo' | 'lineTo'; x: ExpressionValue; y: ExpressionValue }
  | {
      cpx: ExpressionValue;
      cpy: ExpressionValue;
      kind: 'quadraticTo';
      x: ExpressionValue;
      y: ExpressionValue;
    }
  | {
      cp1x: ExpressionValue;
      cp1y: ExpressionValue;
      cp2x: ExpressionValue;
      cp2y: ExpressionValue;
      kind: 'cubicTo';
      x: ExpressionValue;
      y: ExpressionValue;
    }
  | {
      centerX: ExpressionValue;
      centerY: ExpressionValue;
      counterclockwise?: boolean;
      end: ExpressionValue;
      kind: 'arc';
      radius: ExpressionValue;
      start: ExpressionValue;
    }
  | {
      centerX: ExpressionValue;
      centerY: ExpressionValue;
      counterclockwise?: boolean;
      end: ExpressionValue;
      kind: 'ellipse';
      radiusX: ExpressionValue;
      radiusY: ExpressionValue;
      rotation: ExpressionValue;
      start: ExpressionValue;
    }
  | {
      height: ExpressionValue;
      kind: 'rect';
      width: ExpressionValue;
      x: ExpressionValue;
      y: ExpressionValue;
    }
  | {
      height: ExpressionValue;
      kind: 'roundRect';
      radius: ExpressionValue;
      width: ExpressionValue;
      x: ExpressionValue;
      y: ExpressionValue;
    };

export type EffectV1Paint =
  | ExpressionValue
  | {
      kind: 'linearGradient';
      stops: Array<{ color: ExpressionValue; offset: ExpressionValue }>;
      x0: ExpressionValue;
      x1: ExpressionValue;
      y0: ExpressionValue;
      y1: ExpressionValue;
    }
  | {
      kind: 'radialGradient';
      r0: ExpressionValue;
      r1: ExpressionValue;
      stops: Array<{ color: ExpressionValue; offset: ExpressionValue }>;
      x0: ExpressionValue;
      x1: ExpressionValue;
      y0: ExpressionValue;
      y1: ExpressionValue;
    };

export type EffectV1SvgPartTransform =
  | {
      angle?: ExpressionValue;
      blur?: ExpressionValue;
      ease?: 'inOut' | 'linear' | 'out';
      kind: 'preset';
      mode?: 'assemble' | 'scatter' | 'shatter';
      order?: 'center' | 'document' | 'edges' | 'random' | 'reverse';
      reveal?: ExpressionValue;
      rotate?: ExpressionValue;
      scaleFrom?: ExpressionValue;
      spread?: ExpressionValue;
      stagger?: ExpressionValue;
    }
  | {
      alpha?: ExpressionValue;
      blur?: ExpressionValue;
      kind: 'custom';
      originX?: ExpressionValue;
      originY?: ExpressionValue;
      rotate?: ExpressionValue;
      scale?: ExpressionValue;
      x?: ExpressionValue;
      y?: ExpressionValue;
    };

export type EffectV1Filter = {
  blur?: ExpressionValue;
  brightness?: ExpressionValue;
  saturate?: ExpressionValue;
};

export type EffectV1Shadow = {
  blur?: ExpressionValue;
  color?: ExpressionValue;
  x?: ExpressionValue;
  y?: ExpressionValue;
};
