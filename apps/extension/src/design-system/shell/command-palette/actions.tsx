import { Blocks, Filter, Layers3, Moon, Search, Sparkles, Sun } from 'lucide-react';
import type { AppLocale } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { AppTheme } from '../../../ui/theme';
import {
  commandPaletteIcon,
  createCommandPaletteNavigationAction,
  createCommandPaletteRunAction,
  createCommandPaletteToggleAction,
  getCommandPaletteDisabledContextReason,
} from '../../../ui/command-palette/action-builders';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import {
  DESIGN_SYSTEM_KIND_FILTERS,
  DESIGN_SYSTEM_PAGE_NAVIGATION,
  DESIGN_SYSTEM_SCOPE_FILTERS,
  DESIGN_SYSTEM_USAGE_MODES,
  type DesignSystemPageNavigationMeta,
} from '../../catalog/registry/page-controls';
import { localize } from '../../catalog/localization';
import type { DesignSystemPageFilterState, DesignSystemPageState } from '../page/state/types';

interface BuildDesignSystemCommandPaletteActionsArgs {
  locale: AppLocale;
  previewTheme: AppTheme;
  setPreviewTheme: (theme: AppTheme) => void;
  state: DesignSystemPageState;
}

function navigateToSection(sectionId: string) {
  window.location.hash = sectionId;
}

function createNavigationIcon(section: DesignSystemPageNavigationMeta) {
  switch (section.id) {
    case 'overview':
      return commandPaletteIcon(Sparkles);
    case 'tokens':
      return commandPaletteIcon(Layers3);
    default:
      return commandPaletteIcon(Blocks);
  }
}

function buildDesignSystemNavigationActions(): CommandPaletteAction[] {
  return DESIGN_SYSTEM_PAGE_NAVIGATION.map((section) =>
    createCommandPaletteNavigationAction({
      id: section.actionId,
      title: translate(section.labelKey),
      section: translate('shared.ui.commandPaletteNavigationSection'),
      icon: createNavigationIcon(section),
      active: false,
      onSelect: () => navigateToSection(section.id),
    })
  );
}

function buildDesignSystemThemeActions(
  args: Pick<BuildDesignSystemCommandPaletteActionsArgs, 'previewTheme' | 'setPreviewTheme'>
): CommandPaletteAction[] {
  return [
    createCommandPaletteToggleAction({
      id: 'design-system-theme-light',
      title: translate('designSystem.page.lightPreview'),
      section: translate('shared.ui.commandPaletteWorkspaceSection'),
      icon: commandPaletteIcon(Sun),
      active: args.previewTheme === 'light',
      onSelect: () => args.setPreviewTheme('light'),
    }),
    createCommandPaletteToggleAction({
      id: 'design-system-theme-dark',
      title: translate('designSystem.page.darkPreview'),
      section: translate('shared.ui.commandPaletteWorkspaceSection'),
      icon: commandPaletteIcon(Moon),
      active: args.previewTheme === 'dark',
      onSelect: () => args.setPreviewTheme('dark'),
    }),
  ];
}

function buildDesignSystemScopeActions(state: DesignSystemPageState): CommandPaletteAction[] {
  return DESIGN_SYSTEM_SCOPE_FILTERS.map((scope) =>
    createCommandPaletteToggleAction({
      id: scope.actionId,
      title: translate(scope.labelKey),
      section: translate('shared.ui.commandPaletteFiltersSection'),
      icon: scope.value === 'all' ? commandPaletteIcon(Filter) : commandPaletteIcon(Blocks),
      active: state.scopeFilter === scope.value,
      onSelect: () => state.setScopeFilter(scope.value),
    })
  );
}

function buildDesignSystemKindActions(state: DesignSystemPageFilterState): CommandPaletteAction[] {
  return DESIGN_SYSTEM_KIND_FILTERS.map((kind) =>
    createCommandPaletteToggleAction({
      id: kind.actionId,
      title: translate(kind.labelKey),
      section: translate('shared.ui.commandPaletteFiltersSection'),
      icon: commandPaletteIcon(Layers3),
      active: state.kindFilter === kind.value,
      onSelect: () => state.setKindFilter(kind.value),
    })
  );
}

function buildDesignSystemUsageModeActions(
  state: DesignSystemPageFilterState
): CommandPaletteAction[] {
  return DESIGN_SYSTEM_USAGE_MODES.map((usageMode) =>
    createCommandPaletteToggleAction({
      id: usageMode.actionId,
      title: translate(usageMode.labelKey),
      section: translate('shared.ui.commandPaletteFiltersSection'),
      icon: commandPaletteIcon(Filter),
      active: state.usageFilterMode === usageMode.value,
      onSelect: () => state.setUsageFilterMode(usageMode.value),
    })
  );
}

function buildDesignSystemSearchActions(
  args: Pick<BuildDesignSystemCommandPaletteActionsArgs, 'locale' | 'state'>
): CommandPaletteAction[] {
  const usageActions = args.state.usageOptions.slice(0, 8).map((usage) => ({
    id: `design-system-usage-${usage.usageId}`,
    title: localize(args.locale, usage.labelRu, usage.labelEn),
    section: translate('shared.ui.commandPaletteFiltersSection'),
    icon: commandPaletteIcon(Search),
    active: args.state.selectedUsageIds.includes(usage.usageId),
    onSelect: () => args.state.toggleUsageFilter(usage.usageId),
  }));

  return [
    createCommandPaletteRunAction({
      id: 'design-system-clear-filters',
      title: translate('designSystem.page.clearFilters'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Filter),
      disabled: !args.state.hasActiveFilters,
      disabledReason: !args.state.hasActiveFilters
        ? getCommandPaletteDisabledContextReason()
        : undefined,
      onSelect: () => args.state.clearFilters(),
    }),
    ...usageActions.map((action) => createCommandPaletteToggleAction(action)),
  ];
}

export function buildDesignSystemCommandPaletteActions(
  args: BuildDesignSystemCommandPaletteActionsArgs
): CommandPaletteAction[] {
  return [
    ...buildDesignSystemNavigationActions(),
    ...buildDesignSystemThemeActions(args),
    ...buildDesignSystemScopeActions(args.state),
    ...buildDesignSystemKindActions(args.state),
    ...buildDesignSystemUsageModeActions(args.state),
    ...buildDesignSystemSearchActions(args),
  ];
}
