import type { CaptureActionType, QuickAction } from '../../contracts/settings';

// policyStateId: quick-action-capability-policy - canonical field and sink constraints shared by
// Settings canonicalization, popup availability, storage normalization, and runtime validation.
const DESKTOP_AFTER_CAPTURE_ACTIONS = new Set<CaptureActionType>([
  'download_default',
  'ask_system',
  'edit',
  'copy',
  'save_to_library',
]);

export function isDesktopQuickAction(action: Pick<QuickAction, 'screenshotMode'>): boolean {
  return action.screenshotMode === 'desktop';
}

export function getAllowedQuickActionAfterCaptureActions(
  action: Pick<QuickAction, 'screenshotMode'>
): ReadonlySet<CaptureActionType> | null {
  return isDesktopQuickAction(action) ? DESKTOP_AFTER_CAPTURE_ACTIONS : null;
}

function isQuickActionAfterCaptureAllowed(
  action: Pick<QuickAction, 'afterCapture' | 'screenshotMode'>
): boolean {
  const allowed = getAllowedQuickActionAfterCaptureActions(action);
  return !allowed || allowed.has(action.afterCapture ?? 'download_default');
}

export function normalizeQuickActionPolicy(action: QuickAction): QuickAction {
  const afterCapture = action.afterCapture ?? 'download_default';
  const copyToClipboard = afterCapture === 'copy';

  return {
    ...action,
    afterCapture,
    ...(isDesktopQuickAction(action)
      ? { viewportPresetId: null, delay: null, exitAfterCapture: false }
      : {}),
    ...(copyToClipboard ? { imageFormat: 'png', imageQuality: null } : {}),
  };
}

export function normalizeQuickActionEditorPolicy(action: QuickAction): QuickAction {
  const afterCapture = action.afterCapture ?? 'download_default';
  return normalizeQuickActionPolicy({
    ...action,
    afterCapture:
      isDesktopQuickAction(action) && !isQuickActionAfterCaptureAllowed(action)
        ? 'download_default'
        : afterCapture,
  });
}

export function assertQuickActionPolicy(action: QuickAction): void {
  if (!isQuickActionAfterCaptureAllowed(action)) {
    throw new Error('Selected action is unavailable for window or screen capture');
  }
}
