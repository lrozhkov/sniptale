import React from 'react';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { CompactInput } from '../../chrome/ui';

const layerPrimaryTextClassName =
  'block truncate pr-1 text-[13px] font-medium leading-5 text-[color:var(--sniptale-color-text-primary)]';

const layerSecondaryTextClassName =
  'block truncate pr-1 text-[10px] font-semibold uppercase text-[color:var(--sniptale-color-text-muted)]';

function getLayerSecondaryText(layer: EditorLayerItem, effectsLabel: string): string {
  return layer.effectCount > 0
    ? `${layer.typeLabel} · ${layer.effectCount} ${effectsLabel}`
    : layer.typeLabel;
}

function handleLayerNameDoubleClick(
  event: React.MouseEvent<HTMLSpanElement>,
  startEditing: () => void
) {
  event.preventDefault();
  event.stopPropagation();
  startEditing();
}

export function useEditableLayerName(layer: EditorLayerItem) {
  const controller = useEditorController();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [editingName, setEditingName] = React.useState(false);
  const [draftName, setDraftName] = React.useState(layer.name);

  React.useEffect(() => {
    if (!editingName) {
      setDraftName(layer.name);
    }
  }, [editingName, layer.name]);

  React.useEffect(() => {
    if (editingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingName]);

  function commit() {
    const nextName = draftName.trim();
    setEditingName(false);
    if (nextName.length > 0 && nextName !== layer.name) {
      controller.renameLayer(layer.id, nextName);
    }
  }

  function cancel() {
    setEditingName(false);
    setDraftName(layer.name);
  }

  return {
    cancel,
    commit,
    draftName,
    editingName,
    inputRef,
    setDraftName,
    startEditing: () => setEditingName(true),
  };
}

export function LayerName(props: {
  editableName: ReturnType<typeof useEditableLayerName>;
  layer: EditorLayerItem;
}) {
  const effectsLabel = translate('editor.toolbar.layerEffectsAppliedShort');

  if (props.editableName.editingName) {
    return (
      <CompactInput
        ref={props.editableName.inputRef}
        value={props.editableName.draftName}
        onChange={(event) => props.editableName.setDraftName(event.currentTarget.value)}
        onBlur={props.editableName.commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            props.editableName.commit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            props.editableName.cancel();
          }
        }}
      />
    );
  }

  return (
    <span
      onDoubleClick={(event) => handleLayerNameDoubleClick(event, props.editableName.startEditing)}
      className="block min-w-0"
    >
      <span className={layerPrimaryTextClassName}>{props.layer.name}</span>
      <span className={layerSecondaryTextClassName}>
        {getLayerSecondaryText(props.layer, effectsLabel)}
      </span>
    </span>
  );
}
