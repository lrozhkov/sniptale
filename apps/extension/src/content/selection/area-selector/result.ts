import { runBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { SelectedArea } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../platform/i18n';
import { getContentRuntimeServices } from '../../application/runtime-services/services';

const logger = createLogger({ namespace: 'ContentAreaSelector' });

interface AreaSelectionCoordinates {
  endX: number;
  endY: number;
  startX: number;
  startY: number;
}

type AreaSelectionResult = { area: SelectedArea; error?: never } | { area?: never; error: Error };

export interface AreaSelectionResultOwner {
  createSelectionResult(props: AreaSelectionCoordinates): AreaSelectionResult;
}

function buildSelectedArea(props: {
  endX: number;
  endY: number;
  startX: number;
  startY: number;
}): SelectedArea | null {
  const width = Math.abs(props.endX - props.startX);
  const height = Math.abs(props.endY - props.startY);
  if (width < 10 || height < 10) {
    return null;
  }

  const left = props.endX < props.startX ? props.endX : props.startX;
  const top = props.endY < props.startY ? props.endY : props.startY;
  const zoom = window.devicePixelRatio || 1;
  return {
    x: Math.round(left * zoom),
    y: Math.round(top * zoom),
    width: Math.round(width * zoom),
    height: Math.round(height * zoom),
  };
}

function notifyAreaSelected(selectedArea: SelectedArea): void {
  runBestEffort(
    getContentRuntimeServices().messaging.sendRuntimeMessage({
      type: 'AREA_SELECTED',
      area: selectedArea,
    }),
    logger,
    'Failed to notify background about selected area'
  );
}

function createSelectionResult(props: AreaSelectionCoordinates): AreaSelectionResult {
  const selectedArea = buildSelectedArea(props);
  if (!selectedArea) {
    logger.warn('Selection too small, ignoring');
    return { error: new Error(translate('content.runtime.areaSelectTooSmall')) };
  }

  logger.log('Area selected', selectedArea);
  notifyAreaSelected(selectedArea);
  return { area: selectedArea };
}

export const areaSelectionResultOwner: AreaSelectionResultOwner = {
  createSelectionResult,
};
