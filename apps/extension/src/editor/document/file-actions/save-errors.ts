export class EditorStoragePromptError extends Error {
  readonly shouldOfferStorageManager = true;
}

export async function assertBackgroundResponse(
  result: unknown,
  fallbackMessage: string
): Promise<void> {
  if (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    result.success === false
  ) {
    const message =
      'error' in result && typeof result.error === 'string' ? result.error : fallbackMessage;
    throw new EditorStoragePromptError(message);
  }
}
