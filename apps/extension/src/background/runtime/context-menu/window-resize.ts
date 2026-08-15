// policyStateIds: [] - this reconstructible per-window queue only serializes browser effects
// and grants no resize authority.
import { loadSettings } from '../../../composition/persistence/settings';
import { createLogger } from '@sniptale/platform/observability/logger';
import { CaptureSurfaceError } from '../../capture-surface';
import {
  applyPreparedWindowSize,
  prepareWindowSize,
  restoreWindowSnapshot,
} from '../../capture-surface/window';

const windowResizeQueues = new Map<number, Promise<void>>();
const logger = createLogger({ namespace: 'BackgroundContextMenuWindowResize' });

function normalizeWindowResizeError(error: unknown): CaptureSurfaceError {
  if (error instanceof CaptureSurfaceError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const knownCodes = ['window-too-large', 'verification-failed'] as const;
  const code = knownCodes.find((candidate) => message.includes(candidate));
  return new CaptureSurfaceError(code ?? 'platform-rejected', message);
}

async function applyWindowPreset(windowId: number, presetId: string): Promise<void> {
  const settings = await loadSettings();
  const preset = settings.viewportPresets.find((candidate) => candidate.id === presetId);

  if (!preset) throw new CaptureSurfaceError('missing');
  if (!preset.enabled) throw new CaptureSurfaceError('disabled');
  if (preset.target !== 'window') throw new CaptureSurfaceError('unsupported-context');

  let prepared: Awaited<ReturnType<typeof prepareWindowSize>>;
  try {
    prepared = await prepareWindowSize(windowId, preset.width, preset.height);
  } catch (error) {
    throw normalizeWindowResizeError(error);
  }
  try {
    await applyPreparedWindowSize(windowId, prepared.prior, prepared.expected);
  } catch (error) {
    try {
      await restoreWindowSnapshot(windowId, prepared.prior);
    } catch (rollbackError) {
      logger.error('Failed to restore browser window after context-menu resize failure', {
        error,
        rollbackError,
        windowId,
      });
      throw new CaptureSurfaceError('restore-impossible');
    }
    throw normalizeWindowResizeError(error);
  }
}

export function resizeBrowserWindowFromContextMenu(
  windowId: number,
  presetId: string
): Promise<void> {
  if (!Number.isInteger(windowId) || windowId < 0) {
    return Promise.reject(
      new CaptureSurfaceError('platform-rejected', 'Active browser window is unavailable')
    );
  }

  const previous = windowResizeQueues.get(windowId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => applyWindowPreset(windowId, presetId));
  windowResizeQueues.set(windowId, next);

  return next.finally(() => {
    if (windowResizeQueues.get(windowId) === next) {
      windowResizeQueues.delete(windowId);
    }
  });
}
