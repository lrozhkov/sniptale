export function flushCaptureHandlerPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
