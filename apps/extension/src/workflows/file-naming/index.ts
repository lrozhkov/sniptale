import { loadSettings } from '../../composition/persistence/settings';
import {
  resolveFilename,
  type FilenameContext,
  type FilenameRequest,
  type FilenameRules,
} from '../../features/file-naming/rules';

/** One operation owns its frozen preference and time snapshot, including related files. */
export interface FilenameSession {
  context: FilenameContext;
  title?: string | undefined;
  rules: FilenameRules | null | undefined;
}

/** Settings read failure leaves file creation available through the standard rule. */
export async function createFilenameSession(
  operationId: string = crypto.randomUUID(),
  readSettings: () => Promise<{ filenameRules?: FilenameRules | null }> = loadSettings
): Promise<FilenameSession> {
  const now = new Date();
  const settings = await Promise.resolve()
    .then(readSettings)
    .catch(() => undefined);
  return {
    context: { timestamp: now.getTime(), timezoneOffset: now.getTimezoneOffset(), operationId },
    rules: settings?.filenameRules ? { ...settings.filenameRules } : settings?.filenameRules,
  };
}

/** Generates only new artifact names; callers retain explicit or previously stored names. */
export async function createOutputFilename(
  request: FilenameRequest,
  session?: FilenameSession
): Promise<string> {
  const snapshot = session ?? (await createFilenameSession());
  return resolveFilename(
    snapshot.rules,
    { ...request, title: request.title ?? snapshot.title },
    snapshot.context
  ).filename;
}

/** Capture callers with an existing settings snapshot avoid a second settings read. */
export async function createScreenshotFilename(
  mode: string,
  format = 'png',
  settings?: { filenameRules?: FilenameRules | null }
): Promise<string> {
  const session = settings
    ? await createFilenameSession(undefined, async () => settings)
    : undefined;
  return createOutputFilename(
    { category: 'images', type: 'screenshot', extension: format, suffix: mode },
    session
  );
}
