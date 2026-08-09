import { useEffect, useState } from 'react';
import { BorderPresetEditorContent } from './content';
import {
  useBorderPresetEditorState,
  type BorderPresetEditorProps,
} from './useBorderPresetEditorState';

export function BorderPresetEditor(props: BorderPresetEditorProps) {
  const [tagIds, setTagIds] = useState<string[]>([]);
  useEffect(() => {
    if (props.isOpen) setTagIds(props.preset?.tagIds ?? []);
  }, [props.isOpen, props.preset]);
  const state = useBorderPresetEditorState({
    ...props,
    onSave: (preset) => props.onSave({ ...preset, tagIds }),
  });

  if (!props.isOpen) {
    return null;
  }

  return (
    <BorderPresetEditorContent
      isSaving={props.isSaving ?? false}
      onClose={props.onClose}
      state={state}
      tagIds={tagIds}
      onTagIdsChange={setTagIds}
      {...(props.linkedTemplateOptions
        ? { linkedTemplateOptions: props.linkedTemplateOptions }
        : {})}
      {...(props.preset === undefined ? {} : { preset: props.preset })}
    />
  );
}
