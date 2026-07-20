import { useMemo } from 'react';
import { translate } from '../../platform/i18n';
import type { ScenarioSlideRenderOptions } from '../project/stage-render/slide';
import { renderScenarioSlide } from '../project/stage-render/slide';
import type {
  ScenarioElementFrame,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { resolveScenarioCanvasGuides } from './guides';
import { useScenarioCanvasInteractions } from './interactions';
import type { ScenarioCanvasMagnetScope } from './magnet';
import type { ScenarioCanvasStageProps } from './types';

function applyPreviewFrame(
  slide: ScenarioSlide,
  elementId: string | null,
  frame: ScenarioElementFrame | null
): ScenarioSlide {
  if (!elementId || !frame) {
    return slide;
  }

  return {
    ...slide,
    elements: slide.elements.map((element) =>
      element.id === elementId ? { ...element, frame } : element
    ),
  };
}

export function createScenarioCanvasMagnetScope(args: {
  enabled: boolean;
  slide: ScenarioSlide;
}): ScenarioCanvasMagnetScope | null {
  if (!args.enabled) {
    return null;
  }

  return {
    elements: args.slide.elements,
    slide: args.slide.canvas,
  };
}

export function useScenarioCanvasStageModel(args: {
  magnetScope: ScenarioCanvasMagnetScope | null;
  props: ScenarioCanvasStageProps;
  scale: number;
  snapGridSize: number | null;
}) {
  const { props } = args;
  const selectedElement = getSelectedScenarioCanvasElement(props);
  const interactions = useScenarioCanvasInteractions({
    onDeleteElement: props.onDeleteElement,
    onSelectSlide: props.onSelectSlide,
    onTransactionBegin: props.onBeginElementTransaction,
    onTransactionCancel: props.onCancelElementTransaction,
    onTransactionCommit: props.onCommitElementTransaction,
    onUpdateElement: props.onUpdateElement,
    magnetScope: args.magnetScope,
    scale: args.scale,
    selectedElement,
    snapGridSize: args.snapGridSize,
  });
  const previewSlide = useMemo(
    () =>
      applyPreviewFrame(props.slide, interactions.activeFrameElementId, interactions.previewFrame),
    [interactions.activeFrameElementId, interactions.previewFrame, props.slide]
  );
  const rendered = renderScenarioSlide(previewSlide, buildScenarioCanvasRenderOptions(props));
  const selectedRenderedElement =
    props.selectedElementId && !interactions.hasActiveInteraction
      ? (rendered.elements.find((element) => element.element.id === props.selectedElementId) ??
        null)
      : null;

  const guides = args.magnetScope
    ? resolveScenarioCanvasGuides({
        activeElementId: interactions.activeFrameElementId,
        frame: interactions.previewFrame,
        renderedElements: rendered.elements,
        slide: rendered.canvas,
      })
    : [];

  return { guides, interactions, rendered, selectedRenderedElement };
}

function getSelectedScenarioCanvasElement(props: ScenarioCanvasStageProps) {
  return props.selectedElementId
    ? (props.slide.elements.find((element) => element.id === props.selectedElementId) ?? null)
    : null;
}

function buildScenarioCanvasRenderOptions(
  props: ScenarioCanvasStageProps
): ScenarioSlideRenderOptions {
  return {
    mode: 'editor',
    missingAssetLabel: translate('scenario.editor.missingImage'),
    selectedElementIds: props.selectedElementId ? [props.selectedElementId] : [],
    ...(props.assets ? { assets: props.assets } : {}),
    ...(props.clickIndex === undefined ? {} : { clickIndex: props.clickIndex }),
  };
}
