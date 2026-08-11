const CAPTURE_ACTION_TYPES = [
  'download_default',
  'ask_preset',
  'ask_system',
  'scenario',
  'edit',
  'copy',
  'save_to_library',
] as const;

export type CaptureActionType = (typeof CAPTURE_ACTION_TYPES)[number];

export const SCREENSHOT_CAPTURE_MODES = ['visible', 'full', 'selection', 'desktop'] as const;
export type ScreenshotCaptureMode = (typeof SCREENSHOT_CAPTURE_MODES)[number];

export const SCREENSHOT_IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type ScreenshotImageFormat = (typeof SCREENSHOT_IMAGE_FORMATS)[number];

export type ScreenshotCaptureConfig = {
  screenshotMode: ScreenshotCaptureMode;
  viewportPresetId: string | null;
  delay: 0 | 3 | 5 | 10 | null;
  afterCapture: CaptureActionType;
  imageFormat: ScreenshotImageFormat | null;
  imageQuality: number | null;
  exitAfterCapture: boolean;
};

export type DesktopScreenshotSelection = {
  requestId: string;
  reservationToken: string;
} & ({ status: 'cancelled' } | { status: 'selected'; streamId: string });

const captureActionTypeValues = new Set<string>(CAPTURE_ACTION_TYPES);

export function isCaptureActionTypeValue(value: unknown): value is CaptureActionType {
  return typeof value === 'string' && captureActionTypeValues.has(value);
}

const screenshotCaptureModeValues = new Set<string>(SCREENSHOT_CAPTURE_MODES);
const screenshotImageFormatValues = new Set<string>(SCREENSHOT_IMAGE_FORMATS);

export function isScreenshotCaptureMode(value: unknown): value is ScreenshotCaptureMode {
  return typeof value === 'string' && screenshotCaptureModeValues.has(value);
}

export function isScreenshotImageFormat(value: unknown): value is ScreenshotImageFormat {
  return typeof value === 'string' && screenshotImageFormatValues.has(value);
}

export function normalizeScreenshotCaptureConfig(
  config: ScreenshotCaptureConfig
): ScreenshotCaptureConfig {
  const copyToClipboard = config.afterCapture === 'copy';
  return {
    ...config,
    ...(config.screenshotMode === 'desktop'
      ? { viewportPresetId: null, delay: null, exitAfterCapture: false }
      : {}),
    ...(copyToClipboard ? { imageFormat: 'png', imageQuality: null } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDesktopScreenshotSelectionValue(
  value: unknown
): value is DesktopScreenshotSelection {
  if (
    !isRecord(value) ||
    typeof value['requestId'] !== 'string' ||
    typeof value['reservationToken'] !== 'string'
  )
    return false;
  return value['status'] === 'cancelled'
    ? Object.keys(value).length === 3
    : value['status'] === 'selected' &&
        typeof value['streamId'] === 'string' &&
        Object.keys(value).length === 4;
}

function hasScreenshotSourceFields(value: Record<string, unknown>): boolean {
  const delay = value['delay'];
  return (
    isScreenshotCaptureMode(value['screenshotMode']) &&
    (value['viewportPresetId'] === null || typeof value['viewportPresetId'] === 'string') &&
    (delay === null || delay === 0 || delay === 3 || delay === 5 || delay === 10)
  );
}

function hasScreenshotOutputFields(value: Record<string, unknown>): boolean {
  const quality = value['imageQuality'];
  return (
    isCaptureActionTypeValue(value['afterCapture']) &&
    (value['imageFormat'] === null || isScreenshotImageFormat(value['imageFormat'])) &&
    (quality === null ||
      (typeof quality === 'number' &&
        Number.isFinite(quality) &&
        quality >= 1 &&
        quality <= 100)) &&
    typeof value['exitAfterCapture'] === 'boolean'
  );
}

export function isScreenshotCaptureConfigValue(value: unknown): value is ScreenshotCaptureConfig {
  return (
    isRecord(value) &&
    Object.keys(value).length === 7 &&
    hasScreenshotSourceFields(value) &&
    hasScreenshotOutputFields(value)
  );
}
