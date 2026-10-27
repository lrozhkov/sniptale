import { Icon } from 'lucide-react';
import { getQuickActionIconNode } from '../../../../features/quick-actions-presets/icons';
import { translate } from '../../../../platform/i18n/popup';
import { hotkeyToKeyString } from '../../../../features/keyboard-shortcuts/hotkeys';
import {
  SCREENSHOT_MODE_COLORS,
  type QuickAction,
  type ViewportPreset,
} from '../../../../contracts/settings';
import { getViewportPresetDisplayName } from '../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../features/viewport-presets/format';

export function DynamicIcon({ name, color }: { name: string; color?: string }) {
  return (
    <Icon
      iconNode={getQuickActionIconNode(name)}
      aria-hidden="true"
      className="h-4 w-4"
      style={color ? { color } : undefined}
    />
  );
}

function getScreenshotModeLabels(): Record<string, string> {
  return {
    visible: translate('settings.quickActions.screenshotModeVisible'),
    full: translate('settings.quickActions.screenshotModeFull'),
    selection: translate('settings.quickActions.screenshotModeSelection'),
    desktop: translate('settings.quickActions.screenshotModeDesktop'),
  };
}

function getAfterCaptureLabels(): Record<string, string> {
  return {
    download_default: translate('settings.quickActions.afterCaptureDownloadDefault'),
    ask_preset: translate('settings.quickActions.afterCaptureAskPreset'),
    ask_system: translate('settings.quickActions.afterCaptureAskSystem'),
    edit: translate('settings.quickActions.afterCaptureEdit'),
    copy: translate('settings.quickActions.afterCaptureCopy'),
    save_to_library: translate('settings.quickActions.afterCaptureSaveToLibrary'),
  };
}

export function formatHotkeyShort(hotkey: QuickAction['hotkey']): string {
  if (!hotkey) {
    return '';
  }

  return hotkeyToKeyString(hotkey).replace('Cmd+', 'Meta+');
}

export function getQuickActionMeta(action: QuickAction, presets: ViewportPreset[]): string {
  const screenshotModeLabels = getScreenshotModeLabels();
  const afterCaptureLabels = getAfterCaptureLabels();
  const parts = [
    screenshotModeLabels[action.screenshotMode] || translate('popup.labels.screenshotMode'),
  ];

  if (action.viewportPresetId) {
    const preset = presets.find((item) => item.id === action.viewportPresetId);
    if (preset) {
      parts.push(
        `${getViewportPresetDisplayName(preset)} ${formatViewportPresetDimensions(
          preset.width,
          preset.height
        )}`
      );
    }
  }

  if (typeof action.delay === 'number') {
    parts.push(
      action.delay === 0
        ? translate('settings.quickActions.delayNone')
        : `${action.delay} ${translate('settings.quickActions.delayShortSuffix')}`
    );
  }

  if (action.afterCapture) {
    parts.push(afterCaptureLabels[action.afterCapture] || action.afterCapture);
  }

  return parts.join(' • ');
}

export function getQuickActionColor(action: QuickAction): string {
  return SCREENSHOT_MODE_COLORS[action.screenshotMode] || SCREENSHOT_MODE_COLORS.visible;
}
