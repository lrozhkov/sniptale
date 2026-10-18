import React from 'react';
import { InspectorFieldClear } from '../../../ui/compact-inspector-controls/text-field';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { useEditorController } from '../../application/controller-context';
import { CompactInput } from '../../chrome/ui';

const layerPrimaryTextClassName =
  'block truncate pr-1 text-[13px] font-medium leading-[18px] text-[color:var(--sniptale-color-text-primary)]';

function getLayerDisplayName(layer: EditorLayerItem): string {
  return layer.groupSize === undefined ? layer.name : `${layer.name} (${layer.groupSize})`;
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
  if (props.editableName.editingName) {
    return (
      <span className="sniptale-text-value relative block min-w-0 flex-1">
        <CompactInput
          aria-label={props.layer.name}
          className="pr-8"
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
        {props.editableName.draftName ? (
          <InspectorFieldClear label={props.layer.name} target={props.editableName.inputRef} />
        ) : null}
      </span>
    );
  }

  return (
    <span
      onDoubleClick={(event) => handleLayerNameDoubleClick(event, props.editableName.startEditing)}
      className="block min-w-0"
    >
      <span title={getLayerDisplayName(props.layer)} className={layerPrimaryTextClassName}>
        {getLayerDisplayName(props.layer)}
      </span>
    </span>
  );
}
