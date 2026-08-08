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
  type LucideIcon,
} from 'lucide-react';
import type { TranslationKey } from '../../../platform/i18n';
import type { SettingsSectionId } from '../../../platform/navigation/extension-pages/settings-route/codec';
import type { ComponentType } from 'react';

export type SettingsNavItem = {
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
        label: 'settings.navigation.interfaceBrowser',
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    id: 'captureSaving',
    label: 'settings.navigation.groups.captureSaving',
    items: [
      { id: 'quick-actions', label: 'settings.navigation.quickActions', icon: Zap },
      { id: 'screen-sizes', label: 'settings.navigation.screenSizes', icon: Monitor },
      { id: 'media-quality', label: 'settings.navigation.mediaQuality', icon: Image },
      { id: 'saving', label: 'settings.navigation.saving', icon: FolderOpen },
    ],
  },
  {
    id: 'stylesTemplates',
    label: 'settings.navigation.groups.stylesTemplates',
    items: [
      { id: 'annotations', label: 'settings.navigation.annotations', icon: Sparkles },
      { id: 'editor-resources', label: 'settings.navigation.editorResources', icon: Palette },
    ],
  },
  {
    id: 'ai',
    label: 'settings.navigation.groups.ai',
    items: [
      { id: 'ai-connections', label: 'settings.navigation.aiConnections', icon: Bot },
      { id: 'ai-prompts', label: 'settings.navigation.aiPrompts', icon: MessageSquare },
    ],
  },
  {
    id: 'system',
    label: 'settings.navigation.groups.system',
    items: [
      { id: 'voice-input', label: 'settings.navigation.voiceInput', icon: Mic },
      { id: 'native-app', label: 'settings.navigation.nativeApp', icon: MonitorCog },
      { id: 'access-data', label: 'settings.navigation.accessData', icon: ShieldCheck },
    ],
  },
] as const;

export const SETTINGS_NAV_ITEMS = SETTINGS_NAV_GROUPS.flatMap((group) => group.items);

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
};
