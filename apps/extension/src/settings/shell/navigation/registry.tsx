import {
  Bot,
  FolderOpen,
  Image,
  MessageSquare,
  Mic,
  Monitor,
  MonitorCog,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Zap,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';
import type { TranslationKey } from '../../../platform/i18n';
import type { SettingsSectionId } from '../../../platform/navigation/extension-pages/settings-route/codec';
import type { ComponentType } from 'react';

export type SettingsNavItem = {
  description: TranslationKey;
  id: SettingsSectionId;
  icon: LucideIcon;
  label: TranslationKey;
};

type SettingsNavGroup = {
  id: 'general' | 'captureSaving' | 'stylesTemplates' | 'ai' | 'system';
  items: readonly SettingsNavItem[];
  label: TranslationKey;
};

export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    id: 'general',
    label: 'settings.navigation.groups.general',
    items: [
      {
        id: 'interface-browser',
        description: 'settings.navigation.descriptions.interfaceBrowser',
        label: 'settings.navigation.interfaceBrowser',
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    id: 'captureSaving',
    label: 'settings.navigation.groups.captureSaving',
    items: [
      {
        id: 'quick-actions',
        description: 'settings.navigation.descriptions.quickActions',
        label: 'settings.navigation.quickActions',
        icon: Zap,
      },
      {
        id: 'screen-sizes',
        description: 'settings.navigation.descriptions.screenSizes',
        label: 'settings.navigation.screenSizes',
        icon: Monitor,
      },
      {
        id: 'media-quality',
        description: 'settings.navigation.descriptions.mediaQuality',
        label: 'settings.navigation.mediaQuality',
        icon: Image,
      },
      {
        id: 'saving',
        description: 'settings.navigation.descriptions.saving',
        label: 'settings.navigation.saving',
        icon: FolderOpen,
      },
    ],
  },
  {
    id: 'stylesTemplates',
    label: 'settings.navigation.groups.stylesTemplates',
    items: [
      {
        id: 'annotations',
        description: 'settings.navigation.descriptions.annotations',
        label: 'settings.navigation.annotations',
        icon: Sparkles,
      },
      {
        id: 'editor-resources',
        description: 'settings.navigation.descriptions.editorResources',
        label: 'settings.navigation.editorResources',
        icon: Palette,
      },
    ],
  },
  {
    id: 'ai',
    label: 'settings.navigation.groups.ai',
    items: [
      {
        id: 'ai-connections',
        description: 'settings.navigation.descriptions.aiConnections',
        label: 'settings.navigation.aiConnections',
        icon: Bot,
      },
      {
        id: 'ai-prompts',
        description: 'settings.navigation.descriptions.aiPrompts',
        label: 'settings.navigation.aiPrompts',
        icon: MessageSquare,
      },
    ],
  },
  {
    id: 'system',
    label: 'settings.navigation.groups.system',
    items: [
      {
        id: 'voice-input',
        description: 'settings.navigation.descriptions.voiceInput',
        label: 'settings.navigation.voiceInput',
        icon: Mic,
      },
      {
        id: 'native-app',
        description: 'settings.navigation.descriptions.nativeApp',
        label: 'settings.navigation.nativeApp',
        icon: MonitorCog,
      },
      {
        id: 'access-data',
        description: 'settings.navigation.descriptions.accessData',
        label: 'settings.navigation.accessData',
        icon: ShieldCheck,
      },
      {
        id: 'settings-transfer',
        description: 'settings.navigation.descriptions.settingsTransfer',
        label: 'settings.navigation.settingsTransfer',
        icon: ArrowLeftRight,
      },
    ],
  },
] as const;

export const SETTINGS_NAV_ITEMS = SETTINGS_NAV_GROUPS.flatMap((group) => group.items);
export const SETTINGS_NAV_ITEMS_BY_ID = Object.fromEntries(
  SETTINGS_NAV_ITEMS.map((item) => [item.id, item])
) as Record<SettingsSectionId, SettingsNavItem>;

export type SettingsSectionModule = Record<
  string,
  ComponentType<{ onViewChange?: (view: string) => void; view?: string }>
>;
type SettingsSectionLoader = {
  exportName: string;
  load: () => Promise<SettingsSectionModule>;
};

export const DEFERRED_SETTINGS_SECTION_LOADERS: Record<
  Exclude<SettingsSectionId, 'interface-browser'>,
  SettingsSectionLoader
> = {
  'quick-actions': {
    load: () => import('../../sections/capture/quick-actions'),
    exportName: 'QuickActionsSection',
  },
  'screen-sizes': {
    load: () => import('../../sections/capture/screen-sizes'),
    exportName: 'PresetsSection',
  },
  'media-quality': {
    load: () => import('../../sections/capture/media-quality'),
    exportName: 'MediaQualitySection',
  },
  saving: {
    load: () => import('../../sections/capture/saving'),
    exportName: 'SavePresetsSection',
  },
  annotations: {
    load: () => import('../../sections/styles/annotations'),
    exportName: 'AnnotationsSection',
  },
  'editor-resources': {
    load: () => import('../../sections/styles/editor-resources'),
    exportName: 'EditorResourcesSection',
  },
  'ai-connections': {
    load: () => import('../../sections/ai/connections'),
    exportName: 'AIProvidersSection',
  },
  'ai-prompts': {
    load: () => import('../../sections/ai/prompts'),
    exportName: 'AIPromptsSection',
  },
  'voice-input': {
    load: () => import('../../sections/system/voice-input'),
    exportName: 'VoiceInputSettingsSection',
  },
  'native-app': {
    load: () => import('../../sections/system/native-app'),
    exportName: 'NativeAppSection',
  },
  'access-data': {
    load: () => import('../../sections/system/access-data'),
    exportName: 'AccessDataSection',
  },
  'settings-transfer': {
    load: () => import('../../sections/system/settings-transfer'),
    exportName: 'SettingsTransferSection',
  },
};
