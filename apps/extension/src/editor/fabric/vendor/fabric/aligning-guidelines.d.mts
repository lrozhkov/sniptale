import type {
  BasicTransformEvent,
  Canvas,
  FabricObject,
  Point,
  TOriginX,
  TOriginY,
  TPointerEvent,
} from 'fabric';

type PointMap = Record<string, Point>;
type OriginMap = Record<string, [TOriginX, TOriginY]>;
type TransformEvent = BasicTransformEvent<TPointerEvent> & {
  target: FabricObject;
};

export interface AligningLineConfig {
  margin: number;
  width: number;
  color: string;
  xSize: number;
  lineDash: number[] | undefined;
  closeVLine: boolean;
  closeHLine: boolean;
  getObjectsByTarget?: (target: FabricObject) => Set<FabricObject>;
  getPointMap?: (target: FabricObject) => PointMap;
  getContraryMap?: (target: FabricObject) => PointMap;
  contraryOriginMap?: OriginMap;
  drawLine?: (origin: Point, target: Point) => void;
  drawX?: (point: Point, dir: number) => void;
}

export declare class AligningGuidelines {
  canvas: Canvas;
  horizontalLines: Set<string>;
  verticalLines: Set<string>;
  cacheMap: Map<string, Point[]>;
  onlyDrawPoint: boolean;
  contraryOriginMap: OriginMap;
  xSize: number;
  lineDash: number[] | undefined;
  margin: number;
  width: number;
  color: string;
  closeVLine: boolean;
  closeHLine: boolean;
  constructor(canvas: Canvas, options?: Partial<AligningLineConfig>);
  getObjectsByTarget(target: FabricObject): Set<FabricObject>;
  getPointMap(target: FabricObject): PointMap;
  getContraryMap(target: FabricObject): PointMap;
  getCaCheMapValue(object: FabricObject): Point[];
  drawLine(origin: Point, target: Point): void;
  drawX(point: Point, dir: number): void;
  mouseUp(): void;
  scalingOrResizing(event: TransformEvent): void;
  moving(event: TransformEvent): void;
  beforeRender(): void;
  afterRender(): void;
  dispose(): void;
}
