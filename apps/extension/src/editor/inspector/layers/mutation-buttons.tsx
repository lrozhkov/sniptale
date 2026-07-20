import React from 'react';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { EditorIconButton } from '../../chrome/ui';

interface LayerMutationButtonsProps {
  autoNavigateSelectedLayer: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canRename: boolean;
  layerId: string;
  onRenameLayer: () => void;
}

interface LayerMutationButtonConfig {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  danger?: true;
  disabled?: boolean;
}

export function LayerMutationButtons(props: LayerMutationButtonsProps) {
  const controller = useEditorController();
  const buttons = buildLayerMutationButtons(props, controller);

  return (
    <div className="flex items-center gap-1">
      {buttons.map((button) => (
        <EditorIconButton
          key={button.title}
          title={button.title}
          onClick={button.onClick}
          className="h-[26px] w-[26px] shrink-0"
          {...(button.disabled === undefined ? {} : { disabled: button.disabled })}
          {...(button.danger === undefined ? {} : { danger: button.danger })}
        >
          {button.icon}
        </EditorIconButton>
      ))}
    </div>
  );
}

function buildLayerMutationButtons(
  props: LayerMutationButtonsProps,
  controller: ReturnType<typeof useEditorController>
): LayerMutationButtonConfig[] {
  return [
    {
      title: translate('editor.toolbar.renameLayer'),
      onClick: props.onRenameLayer,
      disabled: !props.canRename,
      icon: <Pencil size={13} strokeWidth={2} />,
    },
    {
      title: translate('editor.toolbar.duplicateLayer'),
      onClick: () =>
        withSingleLayerSelection(controller, props.layerId, props.autoNavigateSelectedLayer, () =>
          controller.duplicateSelection()
        ),
      disabled: !props.canDuplicate,
      icon: <Copy size={13} strokeWidth={2} />,
    },
    {
      title: translate('editor.toolbar.deleteLayer'),
      onClick: () =>
        withSingleLayerSelection(controller, props.layerId, props.autoNavigateSelectedLayer, () =>
          controller.deleteSelection()
        ),
      danger: true,
      disabled: !props.canDelete,
      icon: <Trash2 size={13} strokeWidth={2} />,
    },
  ];
}

function withSingleLayerSelection(
  controller: ReturnType<typeof useEditorController>,
  layerId: string,
  autoNavigateSelectedLayer: boolean,
  callback: () => void | Promise<void>
) {
  controller.withHistoryMuted(() => {
    controller.selectLayer(layerId, { focusViewport: autoNavigateSelectedLayer });
  });
  void callback();
}
