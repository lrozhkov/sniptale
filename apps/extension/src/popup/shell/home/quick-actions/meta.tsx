import type { LucideIcon } from 'lucide-react';
import {
  Camera,
  Clipboard,
  ClipboardCopy,
  Clock3,
  Crop,
  Download,
  Eye,
  FileImage,
  Focus,
  Image as ImageIcon,
  Images,
  Laptop,
  Layers,
  Layout,
  Maximize,
  Monitor,
  MonitorDown,
  PencilLine,
  Scan,
  Scissors,
  Send,
  Share2,
  Smartphone,
  SquareDashedMousePointer,
  Tablet,
  Target,
  Zap,
} from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { hotkeyToKeyString } from '../../../../features/keyboard-shortcuts/hotkeys';
import {
  SCREENSHOT_MODE_COLORS,
  type QuickAction,
  type ViewportPreset,
} from '../../../../contracts/settings';

export const ICON_MAP: Record<string, LucideIcon> = {
  Camera,
  Monitor,
  MonitorDown,
  Maximize,
  Crop,
  Scissors,
  Zap,
  Clock3,
  Image: ImageIcon,
  PencilLine,
  FileImage,
  Clipboard,
  ClipboardCopy,
  Download,
  Send,
  Share2,
  Focus,
  Scan,
  SquareDashedMousePointer,
  Target,
  Smartphone,
  Tablet,
  Laptop,
  Layers,
  Layout,
  Eye,
  Images,
};

function getScreenshotModeLabels(): Record<string, string> {
  return {
    visible: translate('settings.quickActions.screenshotModeVisible'),
    full: translate('settings.quickActions.screenshotModeFull'),
    selection: translate('settings.quickActions.screenshotModeSelection'),
  };
}

function getAfterCaptureLabels(): Record<string, string> {
  return {
    download_default: translate('settings.quickActions.afterCaptureDownloadDefault'),
    ask_preset: translate('settings.quickActions.afterCaptureAskPreset'),
    ask_system: translate('settings.quickActions.afterCaptureAskSystem'),
    edit: translate('settings.quickActions.afterCaptureEdit'),
    copy: translate('settings.quickActions.afterCaptureCopy'),
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

  if (action.emulation && action.emulation !== 'native') {
    const preset = presets.find((item) => item.id === action.emulation);
    if (preset) {
      parts.push(`${preset.label} ${preset.width}×${preset.height}`);
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
