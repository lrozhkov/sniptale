export type ScenarioDrawingTool = 'freehand' | 'highlighter' | 'shape';

export interface ScenarioDrawingPoint {
  pressure?: number;
  x: number;
  y: number;
}

export interface ScenarioDrawingStrokeStyle {
  color: string;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'bevel' | 'miter' | 'round';
  opacity: number;
  width: number;
}

export interface ScenarioDrawingStroke {
  id: string;
  kind: 'stroke';
  points: ScenarioDrawingPoint[];
  style: ScenarioDrawingStrokeStyle;
  tool: Exclude<ScenarioDrawingTool, 'shape'>;
}

export interface ScenarioDrawingShape {
  frame: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  id: string;
  kind: 'shape';
  shape: 'ellipse' | 'rectangle';
  style: ScenarioDrawingStrokeStyle & {
    fillColor: string;
  };
}

export type ScenarioDrawingMark = ScenarioDrawingShape | ScenarioDrawingStroke;

export interface ScenarioDrawingDocument {
  marks: ScenarioDrawingMark[];
  slideId: string;
  version: 1;
}
