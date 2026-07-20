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
  Image,
  Laptop,
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

import type {
  CaptureActionType,
  QuickActionDelay,
  QuickActionsDisplayMode,
} from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';

export const allowedQuickActionIcons = [
  'Camera',
  'Monitor',
  'MonitorDown',
  'Maximize',
  'Crop',
  'Scissors',
  'Zap',
  'Clock3',
  'Image',
  'PencilLine',
  'FileImage',
  'Clipboard',
  'ClipboardCopy',
  'Download',
  'Send',
  'Share2',
  'Focus',
  'Scan',
  'SquareDashedMousePointer',
  'Target',
  'Smartphone',
  'Tablet',
  'Laptop',
  'Eye',
] as const;

export const quickActionIconMap: Record<string, LucideIcon> = {
  Camera,
  Monitor,
  MonitorDown,
  Maximize,
  Crop,
  Scissors,
  Zap,
  Clock3,
  Image,
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
  Eye,
};

export const screenshotModeLabels: Record<string, string> = {
  visible: translate('settings.quickActions.screenshotModeVisible'),
  full: translate('settings.quickActions.screenshotModeFull'),
  selection: translate('settings.quickActions.screenshotModeSelection'),
};

export const afterCaptureLabels: Record<CaptureActionType, string> = {
  download_default: translate('settings.quickActions.afterCaptureDownloadDefault'),
  ask_preset: translate('settings.quickActions.afterCaptureAskPreset'),
  ask_system: translate('settings.quickActions.afterCaptureAskSystem'),
  edit: translate('settings.quickActions.afterCaptureEdit'),
  copy: translate('settings.quickActions.afterCaptureCopy'),
  scenario: translate('settings.quickActions.afterCaptureScenario'),
};

export const delayOptions: { value: QuickActionDelay; label: string }[] = [
  { value: 0, label: translate('settings.quickActions.delayNone') },
  { value: 3, label: `3 ${translate('settings.quickActions.delayShortSuffix')}` },
  { value: 5, label: `5 ${translate('settings.quickActions.delayShortSuffix')}` },
  { value: 10, label: `10 ${translate('settings.quickActions.delayShortSuffix')}` },
];

export const qualityOptions = [
  { value: 100, label: '100%' },
  { value: 90, label: '90%' },
  { value: 80, label: '80%' },
  { value: 70, label: '70%' },
  { value: 60, label: '60%' },
];

export const displayModeOptions: {
  value: QuickActionsDisplayMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'list',
    label: translate('settings.quickActions.displayModeList'),
    description: translate('settings.quickActions.displayModeListDescription'),
  },
  {
    value: 'hidden',
    label: translate('settings.quickActions.displayModeHidden'),
    description: translate('settings.quickActions.displayModeHiddenDescription'),
  },
];
