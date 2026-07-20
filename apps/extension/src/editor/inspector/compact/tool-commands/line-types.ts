import type { ToolCommandParams } from './types';

export type LineCommandParams = ToolCommandParams & {
  applyLinePatch: NonNullable<ToolCommandParams['applyLinePatch']>;
  previewLinePatch: NonNullable<ToolCommandParams['previewLinePatch']>;
};

export type LineSettings = LineCommandParams['inspectorToolSettings']['line'];
