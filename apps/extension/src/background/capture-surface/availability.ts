import { browserTabs } from '@sniptale/platform/browser/tabs';
import { loadSettings } from '../../composition/persistence/settings';
import type {
  ViewportPreset,
  ViewportPresetAvailability,
  ViewportPresetAvailabilityReason,
} from '../../features/viewport-presets/contracts';
import type { CaptureSurfaceContext, CaptureSurfaceLeaseState } from './types';
import { getWindowWorkArea } from './window';

function unavailable(
  presetId: string,
  reason: ViewportPresetAvailabilityReason,
  args: {
    required?: { width: number; height: number };
    available?: { width: number; height: number };
    target?: 'window' | null;
  } = {}
): ViewportPresetAvailability {
  const { target = 'window', ...dimensions } = args;
  return { status: 'unavailable', presetId, reason, target, ...dimensions };
}

export async function resolveCaptureSurfacePreset(
  presetId: string
): Promise<ViewportPreset | null> {
  const settings = await loadSettings();
  return settings.viewportPresets.find((preset) => preset.id === presetId) ?? null;
}

export function hasCaptureSurfaceConflict(
  leases: Iterable<CaptureSurfaceLeaseState>,
  tabId: number,
  windowId: number
): boolean {
  return [...leases].some((lease) => {
    if (lease.entry.phase === 'conflict')
      return lease.entry.tabId === tabId || lease.entry.windowId === windowId;
    return lease.entry.windowId === windowId && lease.entry.tabId !== tabId;
  });
}

function projectStaticAvailability(args: {
  context: CaptureSurfaceContext;
  leaseStates: readonly CaptureSurfaceLeaseState[];
  preset: ViewportPreset | null;
  presetId: string;
  tabId: number;
  windowId: number | null;
}): ViewportPresetAvailability | null {
  const { context, leaseStates, preset, presetId, tabId, windowId } = args;
  if (!preset) return unavailable(presetId, 'missing', { target: null });
  const required = { width: preset.width, height: preset.height };
  if (!preset.enabled) return unavailable(preset.id, 'disabled', { required });
  if (context === 'video-screen' || windowId === null) {
    return unavailable(preset.id, 'unsupported-context', { required });
  }
  if (hasCaptureSurfaceConflict(leaseStates, tabId, windowId)) {
    return unavailable(preset.id, 'surface-busy', { required });
  }
  return null;
}

export async function getCaptureSurfaceAvailabilities(
  args: { tabId: number; presetIds: readonly string[]; context: CaptureSurfaceContext },
  leases: Iterable<CaptureSurfaceLeaseState>
): Promise<ViewportPresetAvailability[]> {
  const leaseStates = [...leases];
  const settings = await loadSettings();
  const presetsById = new Map(settings.viewportPresets.map((preset) => [preset.id, preset]));
  const requested = args.presetIds.map((presetId) => ({
    presetId,
    preset: presetsById.get(presetId) ?? null,
  }));
  const needsRuntimeContext = requested.some(
    ({ preset }) => preset?.enabled && args.context !== 'video-screen'
  );
  const tab = needsRuntimeContext ? await browserTabs.get(args.tabId).catch(() => null) : null;
  const windowId = tab?.windowId ?? null;
  const needsMeasurement = requested.some(({ preset, presetId }) =>
    Boolean(
      projectStaticAvailability({
        context: args.context,
        leaseStates,
        preset,
        presetId,
        tabId: args.tabId,
        windowId,
      }) === null
    )
  );
  const capacity =
    needsMeasurement && windowId !== null
      ? await getWindowWorkArea(windowId)
          .then(({ workArea }) => ({ width: workArea.width, height: workArea.height }))
          .catch(() => null)
      : null;

  return requested.map(({ preset, presetId }) => {
    const staticAvailability = projectStaticAvailability({
      context: args.context,
      leaseStates,
      preset,
      presetId,
      tabId: args.tabId,
      windowId,
    });
    if (staticAvailability) return staticAvailability;
    const required = { width: preset!.width, height: preset!.height };
    if (!capacity) return unavailable(presetId, 'platform-rejected', { required });
    if (required.width > capacity.width || required.height > capacity.height) {
      return unavailable(presetId, 'window-too-large', { required, available: capacity });
    }
    return { status: 'available', presetId, target: 'window', required };
  });
}

export async function getCaptureSurfaceAvailability(
  args: { tabId: number; presetId: string; context: CaptureSurfaceContext },
  leases: Iterable<CaptureSurfaceLeaseState>
): Promise<ViewportPresetAvailability> {
  const [availability] = await getCaptureSurfaceAvailabilities(
    { tabId: args.tabId, presetIds: [args.presetId], context: args.context },
    leases
  );
  return availability!;
}
