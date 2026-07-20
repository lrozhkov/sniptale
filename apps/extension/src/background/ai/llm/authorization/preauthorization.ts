const preauthorizedLlmMessages = new WeakSet<object>();
const preauthorizedScenarioEditorLlmMessages = new WeakSet<object>();
const preauthorizedLlmSessionRequestMessages = new WeakSet<object>();

export function markPreauthorizedLlmRouteMessage(message: object): void {
  preauthorizedLlmMessages.add(message);
}

export function markPreauthorizedScenarioEditorLlmRouteMessage(message: object): void {
  preauthorizedScenarioEditorLlmMessages.add(message);
}

export function markPreauthorizedLlmSessionRequestMessage(message: object): void {
  preauthorizedLlmSessionRequestMessages.add(message);
}

export function hasPreauthorizedLlmRouteMessage(message: object): boolean {
  return preauthorizedLlmMessages.has(message);
}

export function hasPreauthorizedScenarioEditorLlmRouteMessage(message: object): boolean {
  return preauthorizedScenarioEditorLlmMessages.has(message);
}

export function hasPreauthorizedLlmSessionRequestMessage(message: object): boolean {
  return preauthorizedLlmSessionRequestMessages.has(message);
}
