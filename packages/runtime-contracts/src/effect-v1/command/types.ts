import type {
  EffectV1Filter,
  EffectV1Paint,
  EffectV1PathSegment,
  EffectV1PointValue,
  EffectV1Shadow,
  EffectV1SvgPartTransform,
} from '../model/drawing.js';
import type { EffectV1Expression, EffectV1RuntimeInputName } from '../model/operations.js';

type ExpressionValue = EffectV1Expression;
type CommandBase = { layerId?: string };
type StyledCommand = CommandBase & {
  alpha?: ExpressionValue;
  blend?: 'lighter' | 'screen' | 'source-over';
  filter?: EffectV1Filter;
  shadow?: EffectV1Shadow;
};
type ChildCommands = { commands: EffectV1Command[] };

export type EffectV1Command =
  | (CommandBase & { color?: EffectV1Paint; op: 'clear' })
  | (CommandBase &
      ChildCommands & {
        height: ExpressionValue;
        op: 'clip';
        width: ExpressionValue;
        x: ExpressionValue;
        y: ExpressionValue;
      })
  | (StyledCommand & {
      fill: EffectV1Paint;
      height: ExpressionValue;
      op: 'fillRect';
      width: ExpressionValue;
      x: ExpressionValue;
      y: ExpressionValue;
    })
  | (CommandBase & ChildCommands & { itemVar?: string; items: unknown[]; op: 'forEach' })
  | (CommandBase &
      ChildCommands & {
        columns: number;
        columnVar?: string;
        op: 'forGrid';
        rows: number;
        rowVar?: string;
      })
  | (CommandBase & ChildCommands & { count: number; indexVar?: string; op: 'forRange' })
  | (StyledCommand &
      ChildCommands & {
        op: 'group';
        rotation?: ExpressionValue;
        scaleX?: ExpressionValue;
        scaleY?: ExpressionValue;
        x?: ExpressionValue;
        y?: ExpressionValue;
      })
  | (StyledCommand & {
      assetId?: string;
      fit?: 'contain' | 'cover' | 'fill';
      height: ExpressionValue;
      input?: EffectV1RuntimeInputName;
      op: 'image';
      rotation?: ExpressionValue;
      width: ExpressionValue;
      x: ExpressionValue;
      y: ExpressionValue;
    })
  | (CommandBase &
      ChildCommands & {
        bindings: Record<string, EffectV1Expression>;
        op: 'let';
      })
  | (StyledCommand & {
      closed?: boolean;
      fill?: EffectV1Paint;
      lineCap?: CanvasLineCap;
      lineJoin?: CanvasLineJoin;
      lineWidth?: ExpressionValue;
      op: 'path';
      points?: EffectV1PointValue[];
      segments?: EffectV1PathSegment[];
      stroke?: EffectV1Paint;
    })
  | (StyledCommand & {
      lineCap?: CanvasLineCap;
      lineJoin?: CanvasLineJoin;
      lineWidth?: ExpressionValue;
      op: 'polyline';
      points: EffectV1PointValue[];
      progress?: ExpressionValue;
      stroke: EffectV1Paint;
    })
  | (CommandBase &
      ChildCommands & {
        height?: ExpressionValue;
        id: string;
        op: 'renderPass';
        width?: ExpressionValue;
      })
  | (StyledCommand & {
      from: ExpressionValue;
      lineCap?: CanvasLineCap;
      lineJoin?: CanvasLineJoin;
      lineWidth?: ExpressionValue;
      op: 'sampledPath';
      sampleVar?: string;
      samples: number;
      stroke: EffectV1Paint;
      to: ExpressionValue;
      x: ExpressionValue;
      y: ExpressionValue;
    })
  | (StyledCommand & {
      height?: ExpressionValue;
      op: 'compositePass';
      passId: string;
      rotation?: ExpressionValue;
      width?: ExpressionValue;
      x?: ExpressionValue;
      y?: ExpressionValue;
    })
  | (StyledCommand & {
      fill?: EffectV1Paint;
      height: ExpressionValue;
      lineWidth?: ExpressionValue;
      op: 'shape';
      radius?: ExpressionValue;
      rotation?: ExpressionValue;
      shape: 'circle' | 'diamond' | 'ellipse' | 'rect' | 'roundRect';
      stroke?: EffectV1Paint;
      width: ExpressionValue;
      x: ExpressionValue;
      y: ExpressionValue;
    })
  | (CommandBase &
      ChildCommands & {
        direction?: 'asc' | 'desc';
        itemVar?: string;
        items: unknown[];
        key: EffectV1Expression;
        op: 'stableOrderBy';
      })
  | (StyledCommand & {
      assetId: string;
      height: ExpressionValue;
      op: 'svgParts';
      part?: EffectV1SvgPartTransform;
      width: ExpressionValue;
      x: ExpressionValue;
      y: ExpressionValue;
    })
  | (StyledCommand & {
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      caret?: boolean;
      fill?: EffectV1Paint;
      fontFamily?: ExpressionValue;
      fontSize?: ExpressionValue;
      fontStyle?: 'italic' | 'normal' | 'oblique';
      fontWeight?: ExpressionValue;
      maxWidth?: ExpressionValue;
      op: 'text';
      reveal?: ExpressionValue;
      text: ExpressionValue;
      x: ExpressionValue;
      y: ExpressionValue;
    })
  | (CommandBase & ChildCommands & { condition: EffectV1Expression; op: 'when' });
