export function getMediaRecorderError(event: unknown, fallbackMessage: string): Error {
  const candidate = hasError(event) ? event.error : null;
  return candidate instanceof Error ? candidate : new Error(fallbackMessage);
}

function hasError(value: unknown): value is { error: unknown } {
  return typeof value === 'object' && value !== null && 'error' in value;
}
