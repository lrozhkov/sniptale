import { translate } from '../../../../platform/i18n';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { ScenarioRuntimeCapturePayload } from '../../../../contracts/messaging/contracts/types';
import type { ScenarioCaptureSurface } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureMetadata,
  ScenarioFramePadding,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import {
  DEFAULT_BORDER_PRESET,
  getLoadedHighlighterSettingsSnapshot,
} from '../../../../composition/persistence/highlighter';
import { buildScreenshotFilename as generateFilename } from '@sniptale/foundation/utils/screenshot-filename';
import {
  buildScenarioPageDescriptor,
  buildScenarioTargetDescriptor,
  describeScenarioTarget,
} from '../../scenario-recorder/runtime';
import { saveScenarioCaptureStep } from '../runtime/transport/steps';
import type { ScenarioControllerResponse } from '../types';

export type ScenarioCaptureSourceAdapter = {
  buildPageDescriptor: () => ScenarioPageDescriptor;
  buildTargetDescriptor: (
    target: HTMLElement,
    framePadding: ScenarioFramePadding
  ) => ScenarioTargetDescriptor | null;
  normalizeCaptureMetadata?: (captureMetadata: ScenarioCaptureMetadata) => ScenarioCaptureMetadata;
  normalizePoint?: (point: ScenarioPoint | null) => ScenarioPoint | null;
};

function createScenarioFramePadding(framePadding: ScenarioFramePadding): ScenarioFramePadding {
  return {
    top: framePadding.top,
    left: framePadding.left,
    right: framePadding.right,
    bottom: framePadding.bottom,
  };
}

function resolveScenarioCaptureFramePadding() {
  const settings = getLoadedHighlighterSettingsSnapshot();
  const preset = settings
    ? (settings.borderPresets.find((item) => item.id === settings.defaultBorderPresetId) ??
      DEFAULT_BORDER_PRESET)
    : DEFAULT_BORDER_PRESET;

  return {
    framePadding: createScenarioFramePadding(preset.padding),
    resolvedFromCache: Boolean(settings),
  };
}

function buildScenarioCaptureMetadata(args: {
  captureMetadata?: ScenarioCaptureMetadata;
  sourceAdapter?: ScenarioCaptureSourceAdapter | undefined;
  sourceKind: 'manual' | 'auto-click';
}): ScenarioCaptureMetadata {
  if (args.captureMetadata) {
    return (
      args.sourceAdapter?.normalizeCaptureMetadata?.(args.captureMetadata) ?? args.captureMetadata
    );
  }

  return {
    pointerRange: null,
    scroll: null,
    trigger: 'pointer-up',
  };
}

function buildScenarioCapturePointFields(args: {
  cursorPoint?: ScenarioPoint | null | undefined;
  interactionPoint?: ScenarioPoint | null | undefined;
  sourceAdapter?: ScenarioCaptureSourceAdapter | undefined;
}) {
  const normalizePoint =
    args.sourceAdapter?.normalizePoint ?? ((point: ScenarioPoint | null) => point);
  return {
    ...(args.interactionPoint === undefined
      ? {}
      : { interactionPoint: normalizePoint(args.interactionPoint) }),
    ...(args.cursorPoint === undefined ? {} : { cursorPoint: normalizePoint(args.cursorPoint) }),
  };
}

function buildScenarioCapturePayload(params: {
  session: ScenarioSessionState;
  screenshotMode: boolean;
  captureSurface: ScenarioCaptureSurface;
  sourceAdapter?: ScenarioCaptureSourceAdapter;
  sourceKind: 'manual' | 'auto-click';
  target?: HTMLElement | null;
  interactionPoint?: ScenarioPoint | null;
  cursorPoint?: ScenarioPoint | null;
  captureMetadata?: ScenarioCaptureMetadata;
}): ScenarioRuntimeCapturePayload | null {
  const {
    captureSurface,
    cursorPoint,
    interactionPoint,
    screenshotMode,
    session,
    sourceKind,
    target,
    captureMetadata,
    sourceAdapter,
  } = params;
  if (!session.enabled || !screenshotMode) {
    return null;
  }

  const page = sourceAdapter?.buildPageDescriptor() ?? buildScenarioPageDescriptor();
  const { framePadding } = resolveScenarioCaptureFramePadding();
  const targetDescriptor = target
    ? buildScenarioTargetDescriptorForSource(target, framePadding, sourceAdapter)
    : null;
  const targetTitle = describeScenarioTarget(targetDescriptor);

  return {
    captureSurface,
    sourceKind,
    page,
    ...(targetDescriptor === null ? {} : { target: targetDescriptor }),
    ...buildScenarioCapturePointFields({ cursorPoint, interactionPoint, sourceAdapter }),
    captureMetadata: buildScenarioCaptureMetadata({
      ...(captureMetadata === undefined ? {} : { captureMetadata }),
      sourceAdapter,
      sourceKind,
    }),
    ...(targetTitle === '' ? {} : { title: targetTitle }),
    ...(page.title ? { body: page.title } : {}),
  };
}

function buildScenarioTargetDescriptorForSource(
  target: HTMLElement,
  framePadding: ScenarioFramePadding,
  sourceAdapter: ScenarioCaptureSourceAdapter | undefined
): ScenarioTargetDescriptor | null {
  if (sourceAdapter) {
    return sourceAdapter.buildTargetDescriptor(target, framePadding);
  }

  return buildScenarioTargetDescriptor(target, framePadding);
}

export function createScenarioCapturePayloadBuilder(args: {
  screenshotMode: boolean;
  sourceAdapter?: ScenarioCaptureSourceAdapter;
  session: ScenarioSessionState;
}) {
  return (
    captureSurface: ScenarioCaptureSurface,
    sourceKind: 'manual' | 'auto-click',
    target?: HTMLElement | null,
    interactionPoint?: ScenarioPoint | null,
    cursorPoint?: ScenarioPoint | null,
    captureMetadata?: ScenarioCaptureMetadata
  ) =>
    buildScenarioCapturePayload({
      session: args.session,
      screenshotMode: args.screenshotMode,
      ...(args.sourceAdapter === undefined ? {} : { sourceAdapter: args.sourceAdapter }),
      captureSurface,
      sourceKind,
      ...(target === undefined ? {} : { target }),
      ...(interactionPoint === undefined ? {} : { interactionPoint }),
      ...(cursorPoint === undefined ? {} : { cursorPoint }),
      ...(captureMetadata === undefined ? {} : { captureMetadata }),
    });
}

export function createScenarioSelectionCaptureSaver(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  buildCapturePayload: (
    captureSurface: ScenarioCaptureSurface,
    sourceKind: 'manual' | 'auto-click',
    target?: HTMLElement | null,
    interactionPoint?: ScenarioPoint | null,
    cursorPoint?: ScenarioPoint | null,
    captureMetadata?: ScenarioCaptureMetadata
  ) => ScenarioRuntimeCapturePayload | null;
}) {
  return async (
    dataUrl: string,
    captureSurface: ScenarioCaptureSurface,
    shouldApplyResponse?: () => boolean
  ) =>
    saveScenarioSelectionCapture({
      dataUrl,
      captureSurface,
      buildCapturePayload: args.buildCapturePayload,
      applyScenarioResponse: args.applyScenarioResponse,
      ...(shouldApplyResponse ? { shouldApplyResponse } : {}),
    });
}

async function saveScenarioSelectionCapture(params: {
  dataUrl: string;
  captureSurface: ScenarioCaptureSurface;
  buildCapturePayload: (
    captureSurface: ScenarioCaptureSurface,
    sourceKind: 'manual' | 'auto-click',
    target?: HTMLElement | null,
    interactionPoint?: ScenarioPoint | null,
    cursorPoint?: ScenarioPoint | null
  ) => ScenarioRuntimeCapturePayload | null;
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  shouldApplyResponse?: () => boolean;
}) {
  const payload = params.buildCapturePayload(params.captureSurface, 'manual');
  if (!payload) {
    return;
  }

  const response = await saveScenarioCaptureStep({
    dataUrl: params.dataUrl,
    filename: generateFilename(params.captureSurface),
    scenarioCapture: payload,
  });

  if (params.shouldApplyResponse?.() === false) {
    return;
  }

  if (response?.success) {
    params.applyScenarioResponse(response);
    return;
  }

  const errorMessage = response?.error || translate('scenario.content.captureSaveError');
  showToast(errorMessage, 'error');
  throw new Error(errorMessage);
}
