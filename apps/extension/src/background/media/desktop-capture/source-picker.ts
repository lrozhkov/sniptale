import {
  browserDesktopCapture,
  type BrowserDesktopCaptureAdapter,
  type BrowserDesktopCaptureResult,
  type BrowserDesktopCaptureSource,
} from '@sniptale/platform/browser/desktop-capture';
import { translate } from '../../../platform/i18n';
import { CaptureMode, type CaptureSource } from '@sniptale/runtime-contracts/video/types/types';

type DesktopCapturePolicyName = 'screen' | 'window';

type DesktopCapturePolicy = {
  sources: readonly BrowserDesktopCaptureSource[];
  fallbackLabel: () => string;
};

type DesktopMediaSourceSelection = {
  label: string;
  streamId: string;
};

export type DesktopMediaSourceChooserResult =
  | { status: 'selected'; selection: DesktopMediaSourceSelection }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export type DesktopCaptureSourcePickerDeps = {
  desktopCapture: Pick<BrowserDesktopCaptureAdapter, 'chooseDesktopMedia'>;
};

const desktopCapturePolicies = {
  screen: {
    sources: ['screen'],
    fallbackLabel: () => translate('shared.runtime.screenFallbackName'),
  },
  window: {
    sources: ['window'],
    fallbackLabel: () => '',
  },
} satisfies Record<DesktopCapturePolicyName, DesktopCapturePolicy>;

function getDefaultDesktopCaptureSourcePickerDeps(): DesktopCaptureSourcePickerDeps {
  return {
    desktopCapture: browserDesktopCapture,
  };
}

function normalizeDesktopCaptureSelection(
  result: BrowserDesktopCaptureResult,
  policy: DesktopCapturePolicy
): DesktopMediaSourceChooserResult {
  if (result.status !== 'selected') {
    return result;
  }

  return {
    status: 'selected',
    selection: {
      label: result.selection.label || policy.fallbackLabel(),
      streamId: result.selection.streamId,
    },
  };
}

async function chooseDesktopCaptureSource(params: {
  deps?: DesktopCaptureSourcePickerDeps;
  policyName: DesktopCapturePolicyName;
  targetTab?: chrome.tabs.Tab;
}): Promise<DesktopMediaSourceChooserResult> {
  const deps = params.deps ?? getDefaultDesktopCaptureSourcePickerDeps();
  const policy = desktopCapturePolicies[params.policyName];
  const result = await deps.desktopCapture.chooseDesktopMedia({
    sources: policy.sources,
    ...(params.targetTab === undefined ? {} : { targetTab: params.targetTab }),
  });

  return normalizeDesktopCaptureSelection(result, policy);
}

export function createDesktopMediaSourceChooser(deps?: DesktopCaptureSourcePickerDeps) {
  return function chooseDesktopMediaSource(
    _captureMode: CaptureMode
  ): Promise<DesktopMediaSourceChooserResult> {
    return chooseDesktopCaptureSource({
      ...(deps === undefined ? {} : { deps }),
      policyName: 'window',
    });
  };
}

export async function getScreenCaptureSource(
  tab: chrome.tabs.Tab,
  deps?: DesktopCaptureSourcePickerDeps
): Promise<CaptureSource> {
  const result = await chooseDesktopCaptureSource({
    ...(deps === undefined ? {} : { deps }),
    policyName: 'screen',
    targetTab: tab,
  });

  if (result.status === 'failed') {
    throw new Error(result.error);
  }
  if (result.status === 'cancelled') {
    throw new Error('SCREEN_SELECTION_CANCELLED');
  }

  return {
    mode: CaptureMode.SCREEN,
    screenName: result.selection.label,
    streamId: result.selection.streamId,
  };
}
