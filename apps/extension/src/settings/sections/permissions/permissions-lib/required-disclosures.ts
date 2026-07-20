import {
  Cable,
  Clipboard,
  Code2,
  Database,
  Download,
  Eye,
  HardDrive,
  MonitorUp,
  MousePointerClick,
  Navigation,
  PanelTop,
  Puzzle,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TranslationKey } from '../../../../platform/i18n';

type RequiredManifestGrantKind = 'content-script' | 'host' | 'permission';

export interface RequiredManifestPermissionDisclosure {
  descriptionKey: TranslationKey;
  icon: LucideIcon;
  id: string;
  kind: RequiredManifestGrantKind;
  nameKey: TranslationKey;
}

export const requiredManifestPermissionDisclosures: RequiredManifestPermissionDisclosure[] = [
  {
    descriptionKey: 'settings.permissions.requiredStorageDescription',
    icon: Database,
    id: 'storage',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredStorageName',
  },
  {
    descriptionKey: 'settings.permissions.requiredContextMenusDescription',
    icon: MousePointerClick,
    id: 'contextMenus',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredContextMenusName',
  },
  {
    descriptionKey: 'settings.permissions.requiredUnlimitedStorageDescription',
    icon: HardDrive,
    id: 'unlimitedStorage',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredUnlimitedStorageName',
  },
  {
    descriptionKey: 'settings.permissions.requiredTabsDescription',
    icon: PanelTop,
    id: 'tabs',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredTabsName',
  },
  {
    descriptionKey: 'settings.permissions.requiredWebNavigationDescription',
    icon: Navigation,
    id: 'webNavigation',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredWebNavigationName',
  },
  {
    descriptionKey: 'settings.permissions.requiredDebuggerDescription',
    icon: Eye,
    id: 'debugger',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredDebuggerName',
  },
  {
    descriptionKey: 'settings.permissions.requiredActiveTabDescription',
    icon: MousePointerClick,
    id: 'activeTab',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredActiveTabName',
  },
  {
    descriptionKey: 'settings.permissions.requiredScriptingDescription',
    icon: Code2,
    id: 'scripting',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredScriptingName',
  },
  {
    descriptionKey: 'settings.permissions.requiredDownloadsDescription',
    icon: Download,
    id: 'downloads',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredDownloadsName',
  },
  {
    descriptionKey: 'settings.permissions.requiredOffscreenDescription',
    icon: Puzzle,
    id: 'offscreen',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredOffscreenName',
  },
  {
    descriptionKey: 'settings.permissions.requiredTabCaptureDescription',
    icon: Video,
    id: 'tabCapture',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredTabCaptureName',
  },
  {
    descriptionKey: 'settings.permissions.requiredDesktopCaptureDescription',
    icon: MonitorUp,
    id: 'desktopCapture',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredDesktopCaptureName',
  },
  {
    descriptionKey: 'settings.permissions.requiredNativeMessagingDescription',
    icon: Cable,
    id: 'nativeMessaging',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredNativeMessagingName',
  },
  {
    descriptionKey: 'settings.permissions.requiredClipboardWriteDescription',
    icon: Clipboard,
    id: 'clipboardWrite',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredClipboardWriteName',
  },
];
