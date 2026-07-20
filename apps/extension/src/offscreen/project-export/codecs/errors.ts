export function closeEncoderQuietly(encoder: VideoEncoder | AudioEncoder | null): void {
  if (!encoder || encoder.state === 'closed') {
    return;
  }

  try {
    encoder.close();
  } catch {
    // no-op: encoder may already be closed after flush/abort
  }
}

export function normalizeError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string' && error.trim()) {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

export function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes('AbortError') || message.includes('PROJECT_EXPORT_CANCELLED');
}
