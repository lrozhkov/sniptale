import { isEditorSpaceKey } from './keyboard';

export function handleEditorWindowKeyUp(options: {
  code: string;
  finalizeSelectionNudge?: (code: string) => void;
}): { nextSpacePressed?: boolean } {
  options.finalizeSelectionNudge?.(options.code);
  return isEditorSpaceKey(options.code) ? { nextSpacePressed: false } : {};
}

export function resolveEditorSpaceKeyUp(code: string): boolean {
  return isEditorSpaceKey(code);
}
