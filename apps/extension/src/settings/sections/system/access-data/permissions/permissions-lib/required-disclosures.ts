import {
  Clipboard,
  Code2,
  Database,
  Download,
  HardDrive,
  MonitorUp,
  MousePointerClick,
  Navigation,
  PanelTop,
  Puzzle,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TranslationKey } from '../../../../../../platform/i18n';

type RequiredManifestGrantKind = 'content-script' | 'host' | 'permission';
export type RequiredPermissionCategory = 'capture' | 'core' | 'page';

export interface RequiredManifestPermissionDisclosure {
  category: RequiredPermissionCategory;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
  id: string;
  kind: RequiredManifestGrantKind;
  nameKey: TranslationKey;
}

export const requiredManifestPermissionDisclosures: RequiredManifestPermissionDisclosure[] = [
  {
    category: 'core',
    descriptionKey: 'settings.permissions.requiredStorageDescription',
    icon: Database,
    id: 'storage',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredStorageName',
  },
  {
    category: 'page',
    descriptionKey: 'settings.permissions.requiredContextMenusDescription',
    icon: MousePointerClick,
    id: 'contextMenus',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredContextMenusName',
  },
  {
    category: 'core',
    descriptionKey: 'settings.permissions.requiredUnlimitedStorageDescription',
    icon: HardDrive,
    id: 'unlimitedStorage',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredUnlimitedStorageName',
  },
  {
    category: 'core',
    descriptionKey: 'settings.permissions.requiredTabsDescription',
    icon: PanelTop,
    id: 'tabs',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredTabsName',
  },
  {
    category: 'core',
    descriptionKey: 'settings.permissions.requiredWebNavigationDescription',
    icon: Navigation,
    id: 'webNavigation',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredWebNavigationName',
  },
  {
    category: 'page',
    descriptionKey: 'settings.permissions.requiredSystemDisplayDescription',
    icon: MonitorUp,
    id: 'system.display',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredSystemDisplayName',
  },
  {
    category: 'page',
    descriptionKey: 'settings.permissions.requiredActiveTabDescription',
    icon: MousePointerClick,
    id: 'activeTab',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredActiveTabName',
  },
  {
    category: 'page',
    descriptionKey: 'settings.permissions.requiredScriptingDescription',
    icon: Code2,
    id: 'scripting',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredScriptingName',
  },
  {
    category: 'capture',
    descriptionKey: 'settings.permissions.requiredDownloadsDescription',
    icon: Download,
    id: 'downloads',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredDownloadsName',
  },
  {
    category: 'capture',
    descriptionKey: 'settings.permissions.requiredOffscreenDescription',
    icon: Puzzle,
    id: 'offscreen',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredOffscreenName',
  },
  {
    category: 'capture',
    descriptionKey: 'settings.permissions.requiredTabCaptureDescription',
    icon: Video,
    id: 'tabCapture',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredTabCaptureName',
  },
  {
    category: 'capture',
    descriptionKey: 'settings.permissions.requiredDesktopCaptureDescription',
    icon: MonitorUp,
    id: 'desktopCapture',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredDesktopCaptureName',
  },
  {
    category: 'capture',
    descriptionKey: 'settings.permissions.requiredClipboardWriteDescription',
    icon: Clipboard,
    id: 'clipboardWrite',
    kind: 'permission',
    nameKey: 'settings.permissions.requiredClipboardWriteName',
  },
];
