let styleInspectorModeEnabled = false;

export function isQuickEditStyleInspectorModeEnabled(): boolean {
  return styleInspectorModeEnabled;
}

export function setQuickEditStyleInspectorModeEnabled(enabled: boolean): void {
  styleInspectorModeEnabled = enabled;
}
