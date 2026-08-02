import {
  FolderOpen,
  Image,
  MessageSquare,
  Monitor,
  MonitorCog,
  PenTool,
  Shield,
  ShieldCheck,
  Sparkles,
  SunMoon,
  Zap,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TranslationKey } from '../../../platform/i18n';

export type SettingsTab =
  | 'appearance'
  | 'ai'
  | 'presets'
  | 'saves'
  | 'editor'
  | 'templates'
  | 'permissions'
  | 'privacy'
  | 'image'
  | 'video'
  | 'quickactions'
  | 'nativeApp'
  | 'highlighter';

type SettingsNavItem = {
  id: SettingsTab;
  label: TranslationKey;
  icon: LucideIcon;
};

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  { id: 'appearance', label: 'settings.navigation.appearance', icon: SunMoon },
  { id: 'ai', label: 'settings.navigation.ai', icon: Sparkles },
  { id: 'presets', label: 'settings.navigation.presets', icon: Monitor },
  { id: 'saves', label: 'settings.navigation.saves', icon: FolderOpen },
  { id: 'highlighter', label: 'settings.navigation.highlighter', icon: PenTool },
  { id: 'editor', label: 'settings.navigation.editor', icon: Image },
  { id: 'image', label: 'settings.navigation.image', icon: Image },
  { id: 'video', label: 'settings.navigation.video', icon: Video },
  { id: 'quickactions', label: 'settings.navigation.quickactions', icon: Zap },
  { id: 'nativeApp', label: 'settings.navigation.nativeApp', icon: MonitorCog },
  { id: 'templates', label: 'settings.navigation.templates', icon: MessageSquare },
  { id: 'permissions', label: 'settings.navigation.permissions', icon: ShieldCheck },
  { id: 'privacy', label: 'settings.navigation.privacy', icon: Shield },
] as const;

export function isSettingsTabVisible(tab: unknown): tab is SettingsTab {
  return SETTINGS_NAV_ITEMS.some((item) => item.id === tab);
}

export function normalizeSettingsTab(tab: unknown): SettingsTab {
  return isSettingsTabVisible(tab) ? tab : 'appearance';
}
