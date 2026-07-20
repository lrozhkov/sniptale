const CONTENT_RUNTIME_SHIM_SOURCE =
  '../../../packages/platform/src/ports/runtime-messaging/content-runtime-shim.ts';
const CONTENT_RUNTIME_SHIM_INPUT = CONTENT_RUNTIME_SHIM_SOURCE.slice(3);

export function assertContentRuntimeShimInputsAreCompact(inputs: Record<string, unknown>): void {
  const forbiddenInputs = Object.keys(inputs).filter(isForbiddenContentRuntimeShimInput);
  if (forbiddenInputs.length === 0) {
    return;
  }

  throw new Error(
    `Injected content runtime shim must stay compact; forbidden bundle inputs: ${forbiddenInputs.join(
      ', '
    )}`
  );
}

export function assertContentRuntimeShimOutputIsCompact(source: string): void {
  const lineCount = source.split('\n').length;
  const byteCount = new TextEncoder().encode(source).byteLength;
  const maxLineCount = 5000;
  const maxByteCount = 200 * 1024;

  if (lineCount <= maxLineCount && byteCount <= maxByteCount) {
    return;
  }

  throw new Error(
    `Injected content runtime shim output is too large: ${lineCount} lines, ${byteCount} bytes`
  );
}

function isForbiddenContentRuntimeShimInput(input: string): boolean {
  const normalizedInput = repositoryRelativeAppInput(input.replace(/\\/gu, '/'));
  return (
    normalizedInput.endsWith('.css') ||
    referencesReact(normalizedInput) ||
    referencesFullContentRuntimeServices(normalizedInput) ||
    referencesSharedRuntimeMessaging(normalizedInput) ||
    referencesSharedStorage(normalizedInput) ||
    referencesSharedUi(normalizedInput) ||
    referencesOverlay(normalizedInput) ||
    referencesParser(normalizedInput) ||
    referencesFullRuntimeEntrypoint(normalizedInput)
  );
}

function repositoryRelativeAppInput(input: string): string {
  return input.startsWith('src/content/') ? `apps/extension/${input}` : input;
}

function referencesFullContentRuntimeServices(input: string): boolean {
  return (
    input.includes('/apps/extension/src/content/application/runtime-services/') ||
    input.startsWith('apps/extension/src/content/application/runtime-services/') ||
    input.includes('/apps/extension/src/content/platform/runtime-services/') ||
    input.startsWith('apps/extension/src/content/platform/runtime-services/')
  );
}

function referencesSharedRuntimeMessaging(input: string): boolean {
  if (input === CONTENT_RUNTIME_SHIM_INPUT) {
    return false;
  }

  return (
    input.includes('/packages/platform/src/ports/runtime-messaging/') ||
    input.startsWith('packages/platform/src/ports/runtime-messaging/') ||
    input.includes('/apps/extension/src/platform/runtime-messaging/') ||
    input.startsWith('apps/extension/src/platform/runtime-messaging/')
  );
}

function referencesSharedStorage(input: string): boolean {
  return (
    input.includes('/apps/extension/src/composition/persistence/') ||
    input.startsWith('apps/extension/src/composition/persistence/') ||
    input.includes('/apps/extension/src/storage/') ||
    input.startsWith('apps/extension/src/storage/')
  );
}

function referencesSharedUi(input: string): boolean {
  return (
    input.includes('/packages/ui/src/') ||
    input.startsWith('packages/ui/src/') ||
    input.includes('/apps/extension/src/ui/') ||
    input.startsWith('apps/extension/src/ui/')
  );
}

function referencesReact(input: string): boolean {
  return input.includes('/node_modules/react/') || input.includes('node_modules/react-dom/');
}

function referencesOverlay(input: string): boolean {
  return (
    input.includes('/apps/extension/src/content/overlay/') ||
    input.startsWith('apps/extension/src/content/overlay/')
  );
}

function referencesParser(input: string): boolean {
  return (
    input.includes('/apps/extension/src/content/parser/') ||
    input.startsWith('apps/extension/src/content/parser/')
  );
}

function referencesFullRuntimeEntrypoint(input: string): boolean {
  return (
    input.endsWith('/apps/extension/src/content/index.tsx') ||
    input === 'apps/extension/src/content/index.tsx' ||
    input.endsWith('/apps/extension/src/content/runtime/entrypoint/bootstrap.tsx') ||
    input === 'apps/extension/src/content/runtime/entrypoint/bootstrap.tsx'
  );
}
