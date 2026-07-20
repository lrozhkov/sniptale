export function handleEditorWindowBlur(options: { finalizeSelectionNudge?: () => void }): void {
  options.finalizeSelectionNudge?.();
}
