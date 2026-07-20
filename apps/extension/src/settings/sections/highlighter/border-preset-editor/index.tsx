import { BorderPresetEditorContent } from './content';
import {
  useBorderPresetEditorState,
  type BorderPresetEditorProps,
} from './useBorderPresetEditorState';

export function BorderPresetEditor(props: BorderPresetEditorProps) {
  const state = useBorderPresetEditorState(props);

  if (!props.isOpen) {
    return null;
  }

  return (
    <BorderPresetEditorContent
      onClose={props.onClose}
      state={state}
      {...(props.preset === undefined ? {} : { preset: props.preset })}
    />
  );
}
