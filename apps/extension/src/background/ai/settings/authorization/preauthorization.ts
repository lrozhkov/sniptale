const preauthorizedAiSettingsMutationMessages = new WeakSet<object>();

export function markPreauthorizedAiSettingsMutationMessage(message: object): void {
  preauthorizedAiSettingsMutationMessages.add(message);
}

export function hasPreauthorizedAiSettingsMutationMessage(message: object): boolean {
  return preauthorizedAiSettingsMutationMessages.has(message);
}
