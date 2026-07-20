import { useId } from 'react';
import { translate } from '../../platform/i18n';
import type { CommandPaletteAction, CommandPaletteProps } from './types';
import { CommandPaletteSurface } from './views';
import {
  useCommandPaletteController,
  useCommandPaletteKeyDown,
  useCommandPaletteSelectAction,
} from './controller';

function localizeCommandPaletteGroups(
  groups: ReturnType<typeof useCommandPaletteController>['groups']
) {
  return groups.map((group) => ({
    ...group,
    label: translate(group.label),
  }));
}

function createHoverActionHandler(controller: ReturnType<typeof useCommandPaletteController>) {
  return (actionId: string) => {
    controller.setSelectedIndex(controller.flatActionIds.indexOf(actionId));
  };
}

function useCommandPaletteSelectionHandlers(args: {
  controller: ReturnType<typeof useCommandPaletteController>;
  handleSelectAction: (action: CommandPaletteAction | undefined) => Promise<void>;
  onActionError: CommandPaletteProps['onActionError'];
  onActionStart: CommandPaletteProps['onActionStart'];
  onClose: () => void;
}) {
  const selectAction = (action: CommandPaletteAction | undefined) => {
    if (!action || action.disabled) {
      return;
    }

    args.onActionStart?.(action);
    void args.handleSelectAction(action).catch((error) => {
      args.onActionError?.(action, error);
    });
  };
  const handleKeyDown = useCommandPaletteKeyDown({
    flatActions: args.controller.flatActions,
    selectedIndex: args.controller.selectedIndex,
    setSelectedIndex: args.controller.setSelectedIndex,
    onClose: args.onClose,
    onSelectAction: selectAction,
  });

  return { handleKeyDown, selectAction };
}

export function CommandPalette({
  isOpen,
  actionError,
  actions,
  onActionError,
  onActionStart,
  onClose,
  storageKey,
  dataUi = 'shared.ui.command-palette',
}: CommandPaletteProps) {
  const titleId = useId();
  const controller = useCommandPaletteController(actions, isOpen, storageKey);
  const localizedGroups = localizeCommandPaletteGroups(controller.groups);
  const handleSelectAction = useCommandPaletteSelectAction({
    storageKey,
    recentActionIds: controller.recentActionIds,
    setRecentActionIds: controller.setRecentActionIds,
    onClose,
  });
  const handleHoverAction = createHoverActionHandler(controller);
  const { handleKeyDown, selectAction } = useCommandPaletteSelectionHandlers({
    controller,
    handleSelectAction,
    onActionError,
    onActionStart,
    onClose,
  });

  return (
    <CommandPaletteSurface
      isOpen={isOpen}
      dataUi={dataUi}
      titleId={titleId}
      title={translate('shared.ui.commandPaletteTitle')}
      actionError={actionError ?? null}
      query={controller.query}
      inputRef={controller.inputRef}
      flatActions={controller.flatActions}
      groups={localizedGroups}
      flatActionIds={controller.flatActionIds}
      selectedIndex={controller.selectedIndex}
      onClose={onClose}
      onQueryChange={controller.setQuery}
      onHoverAction={handleHoverAction}
      onSelectAction={selectAction}
      onKeyDown={handleKeyDown}
    />
  );
}
