import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { TranslationKey } from '../../platform/i18n';
import type { CommandPaletteAction } from './types';

type BaseActionArgs = {
  id: string;
  title: string;
  subtitle?: string | undefined;
  section?: string | undefined;
  keywords?: readonly string[] | undefined;
  shortcut?: string | undefined;
  icon?: ReactNode | undefined;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  onSelect: () => void | Promise<void>;
};

type ContextActionArgs = BaseActionArgs & {
  active: boolean;
  activeSubtitle?: string;
  inactiveSubtitle?: string;
};

export function commandPaletteIcon(Icon: LucideIcon): ReactNode {
  return <Icon size={16} strokeWidth={1.8} />;
}

function createCommandPaletteAction(
  args: BaseActionArgs & { subtitle: string }
): CommandPaletteAction {
  return {
    id: args.id,
    title: args.title,
    subtitle: args.subtitle,
    onSelect: args.onSelect,
    ...(args.section === undefined ? {} : { section: args.section }),
    ...(args.keywords === undefined ? {} : { keywords: args.keywords }),
    ...(args.shortcut === undefined ? {} : { shortcut: args.shortcut }),
    ...(args.icon === undefined ? {} : { icon: args.icon }),
    ...(args.disabled === undefined ? {} : { disabled: args.disabled }),
    ...(args.disabledReason === undefined ? {} : { disabledReason: args.disabledReason }),
  };
}

export function createCommandPaletteRunAction(args: BaseActionArgs): CommandPaletteAction {
  return createCommandPaletteAction({
    ...args,
    subtitle: args.subtitle ?? translate('shared.ui.commandPaletteRunActionHint'),
  });
}

function resolveContextSubtitle(args: {
  active: boolean;
  activeSubtitle: string | undefined;
  inactiveSubtitle: string | undefined;
  activeTranslationKey: TranslationKey;
  inactiveTranslationKey: TranslationKey;
}): string {
  if (args.active) {
    return args.activeSubtitle ?? translate(args.activeTranslationKey);
  }

  return args.inactiveSubtitle ?? translate(args.inactiveTranslationKey);
}

export function createCommandPaletteToggleAction(args: ContextActionArgs): CommandPaletteAction {
  return createCommandPaletteAction({
    ...args,
    subtitle:
      args.subtitle ??
      resolveContextSubtitle({
        active: args.active,
        activeSubtitle: args.activeSubtitle,
        inactiveSubtitle: args.inactiveSubtitle,
        activeTranslationKey: 'shared.ui.commandPaletteCurrentContextHint',
        inactiveTranslationKey: 'shared.ui.commandPaletteToggleHint',
      }),
  });
}

export function createCommandPaletteNavigationAction(
  args: ContextActionArgs
): CommandPaletteAction {
  return createCommandPaletteAction({
    ...args,
    subtitle:
      args.subtitle ??
      resolveContextSubtitle({
        active: args.active,
        activeSubtitle: args.activeSubtitle,
        inactiveSubtitle: args.inactiveSubtitle,
        activeTranslationKey: 'shared.ui.commandPaletteCurrentPageHint',
        inactiveTranslationKey: 'shared.ui.commandPaletteNavigationHint',
      }),
  });
}

export function createCommandPaletteToolAction(args: ContextActionArgs): CommandPaletteAction {
  return createCommandPaletteAction({
    ...args,
    subtitle:
      args.subtitle ??
      resolveContextSubtitle({
        active: args.active,
        activeSubtitle: args.activeSubtitle,
        inactiveSubtitle: args.inactiveSubtitle,
        activeTranslationKey: 'shared.ui.commandPaletteCurrentContextHint',
        inactiveTranslationKey: 'shared.ui.commandPaletteToolHint',
      }),
  });
}

export function createCommandPaletteUtilityAction(args: BaseActionArgs): CommandPaletteAction {
  return createCommandPaletteAction({
    ...args,
    subtitle: args.subtitle ?? translate('shared.ui.commandPaletteUtilityHint'),
  });
}

export function getCommandPaletteDisabledContextReason(): string {
  return translate('shared.ui.commandPaletteDisabledContextHint');
}
