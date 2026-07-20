import type {
  ScenarioCalloutElement,
  ScenarioArrowElement,
  ScenarioCodeElement,
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioImageElement,
  ScenarioLineElement,
  ScenarioShapeElement,
  ScenarioSlide,
  ScenarioTextElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';

export type ScenarioSlideRenderMode = 'aiAttachment' | 'editor' | 'export' | 'thumbnail';

export interface ScenarioSlideRenderAsset {
  alt?: string;
  height: number | null;
  source: string;
  width: number | null;
}

export type ScenarioSlideRenderAssetMap =
  | ReadonlyMap<string, ScenarioSlideRenderAsset>
  | Readonly<Record<string, ScenarioSlideRenderAsset>>;

export interface ScenarioSlideRenderOptions {
  assets?: ScenarioSlideRenderAssetMap;
  clickIndex?: number;
  missingAssetLabel?: string;
  mode: ScenarioSlideRenderMode;
  outputHeight?: number;
  outputWidth?: number;
  selectedElementIds?: readonly string[];
}

export interface ScenarioRenderBox extends ScenarioElementFrame {
  centerX: number;
  centerY: number;
}

export interface ScenarioMissingSlideAsset {
  assetId: string;
  elementId: string;
}

export interface ScenarioBaseRenderedElement<TElement extends ScenarioElement = ScenarioElement> {
  box: ScenarioRenderBox;
  element: TElement;
  kind: TElement['kind'];
  selected: boolean;
}

export interface ScenarioRenderedImageElement extends ScenarioBaseRenderedElement<ScenarioImageElement> {
  asset: ScenarioSlideRenderAsset | null;
  contentBox: ScenarioElementFrame;
  missingAssetLabel?: string;
}

export type ScenarioRenderedElement =
  | ScenarioBaseRenderedElement<ScenarioTextElement>
  | ScenarioRenderedImageElement
  | ScenarioBaseRenderedElement<ScenarioShapeElement>
  | ScenarioBaseRenderedElement<ScenarioLineElement>
  | ScenarioBaseRenderedElement<ScenarioArrowElement>
  | ScenarioBaseRenderedElement<ScenarioCalloutElement>
  | ScenarioBaseRenderedElement<ScenarioCodeElement>;

export interface ScenarioSlideRenderResult {
  canvas: {
    backgroundColor: string;
    height: number;
    scale: number;
    sourceHeight: number;
    sourceWidth: number;
    width: number;
  };
  elements: ScenarioRenderedElement[];
  missingAssets: ScenarioMissingSlideAsset[];
  selectionBoxes: ScenarioRenderBox[];
  slide: ScenarioSlide;
  svg: string;
}
