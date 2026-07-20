import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import { selectCaptureComposition } from './selection';
import type {
  CaptureAssetSize,
  CaptureCompositionKind,
  CaptureLayout,
  ScenarioCaptureSlideInput,
} from './types';

interface CaptureFrameContainer {
  height: number;
  width: number;
  x: number;
  y: number;
}

const LAYOUT_CONTAINERS: Record<CaptureCompositionKind, CaptureFrameContainer> = {
  'click-sequence': { height: 790, width: 1320, x: 60, y: 54 },
  'full-screen-context': { height: 804, width: 1344, x: 48, y: 48 },
  'side-note-walkthrough': { height: 704, width: 936, x: 68, y: 98 },
  'sparse-viewport': { height: 816, width: 1356, x: 42, y: 42 },
  'target-focused': { height: 790, width: 1320, x: 60, y: 54 },
};

const LAYOUT_BACKGROUND: Record<CaptureCompositionKind, string> = {
  'click-sequence': '#faf7f0',
  'full-screen-context': '#fbfaf6',
  'side-note-walkthrough': '#faf7f0',
  'sparse-viewport': '#fbfaf6',
  'target-focused': '#faf7f0',
};

export function createCaptureLayout(input: ScenarioCaptureSlideInput): CaptureLayout {
  const kind = selectCaptureComposition(input);

  return {
    calloutAnchor: getCalloutAnchor(kind),
    imageFrame: fitAssetInContainer(input.assetSize, LAYOUT_CONTAINERS[kind]),
    kind,
    slideBackgroundColor: LAYOUT_BACKGROUND[kind],
  };
}

function getCalloutAnchor(kind: CaptureCompositionKind): CaptureLayout['calloutAnchor'] {
  if (kind === 'full-screen-context') {
    return 'none';
  }
  if (kind === 'side-note-walkthrough') {
    return 'side';
  }

  return 'corner';
}

function fitAssetInContainer(
  assetSize: CaptureAssetSize,
  container: CaptureFrameContainer
): ScenarioElementFrame {
  const aspect = resolveAspect(assetSize);
  const width = Math.min(container.width, container.height * aspect);
  const height = width / aspect;

  return {
    height,
    width,
    x: container.x + (container.width - width) / 2,
    y: container.y + (container.height - height) / 2,
  };
}

function resolveAspect(assetSize: CaptureAssetSize): number {
  return assetSize.width && assetSize.height && assetSize.width > 0 && assetSize.height > 0
    ? assetSize.width / assetSize.height
    : 16 / 9;
}
