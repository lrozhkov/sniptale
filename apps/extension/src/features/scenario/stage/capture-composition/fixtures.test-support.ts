import type { ScenarioCaptureSlideInput } from './types';

export function createCaptureInput(
  overrides: Partial<ScenarioCaptureSlideInput> = {}
): ScenarioCaptureSlideInput {
  const input: ScenarioCaptureSlideInput = {
    assetRef: { assetId: 'asset-capture', galleryAssetId: 'gallery-capture' },
    assetSize: { height: 900, width: 1440 },
    body: 'Click the scenario action while keeping the app context visible.',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    captureSurface: 'visible',
    cursorPoint: { x: 704, y: 424 },
    interactionPoint: { x: 702, y: 424 },
    now: 1_700_000_000_000,
    page: createPage(),
    slideIndex: 0,
    sourceKind: 'auto-click',
    target: createTarget(),
    title: 'Open scenario editor',
  };

  return { ...input, ...overrides };
}

export function createPage(): ScenarioCaptureSlideInput['page'] {
  return {
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    title: 'Hatiqo customer workspace',
    url: 'https://app.hatiqo.local/accounts',
    viewport: { height: 900, width: 1440, x: 0, y: 0 },
  };
}

function createTarget(): NonNullable<ScenarioCaptureSlideInput['target']> {
  return {
    ariaLabel: 'Open scenario editor',
    framePadding: null,
    iframeSelector: null,
    rect: { height: 46, width: 178, x: 612, y: 394 },
    role: 'button',
    selector: '[data-action="create-scenario"]',
    tagName: 'button',
    text: 'Create scenario',
    title: null,
  };
}
