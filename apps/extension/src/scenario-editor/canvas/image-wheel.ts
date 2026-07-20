import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioCanvasStageProps } from './types';
import { createImageContentZoomPatch } from './image-content';

export function useSelectedImageWheelZoom(args: {
  onUpdateElement: ScenarioCanvasStageProps['onUpdateElement'];
  selectedRenderedElement: ScenarioRenderedElement | null;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const { stageRef } = args;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => handleSelectedImageWheel(event, args);
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [args, stageRef]);
}

function handleSelectedImageWheel(
  event: WheelEvent,
  args: {
    onUpdateElement: ScenarioCanvasStageProps['onUpdateElement'];
    selectedRenderedElement: ScenarioRenderedElement | null;
  }
) {
  const rendered = args.selectedRenderedElement;
  if (!rendered || rendered.kind !== SCENARIO_V3_ELEMENT_KINDS.image || rendered.element.locked) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  args.onUpdateElement(
    rendered.element.id,
    createImageContentZoomPatch({
      direction: event.deltaY > 0 ? 'out' : 'in',
      snapshot: rendered.element.contentTransform,
    })
  );
}
