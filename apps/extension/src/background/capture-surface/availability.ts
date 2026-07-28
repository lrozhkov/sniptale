import { browserTabs } from '@sniptale/platform/browser/tabs';
import { loadSettings } from '../../composition/persistence/settings';
import type {
  ViewportPreset,
  ViewportPresetAvailability,
  ViewportPresetAvailabilityReason,
  ViewportPresetTarget,
} from '../../features/viewport-presets/contracts';
import type { CaptureSurfaceLeaseState, CaptureSurfaceContext } from './types';
import { getTabZoom } from './viewport';
import { readViewportCapacity as readPageViewportCapacity } from './viewport-capacity';
import { getWindowWorkArea } from './window';

function isVideoContext(context: CaptureSurfaceContext): boolean {
  return context === 'video-tab' || context === 'video-tab-crop';
}

function unavailable(
  presetId: string,
  reason: ViewportPresetAvailabilityReason,
  args: {
    target?: ViewportPresetTarget | null;
    required?: { width: number; height: number };
    available?: { width: number; height: number };
  } = {}
): ViewportPresetAvailability {
  return { status: 'unavailable', presetId, reason, target: args.target ?? null, ...args };
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
  windowId: number,
  target: ViewportPresetTarget
): boolean {
  return [...leases].some((lease) => {
    const sharesWindow = lease.entry.windowId === windowId;
    const windowExclusive = target === 'window' || lease.applied.target === 'window';
    if (lease.entry.phase === 'conflict') {
      return lease.entry.tabId === tabId || (sharesWindow && windowExclusive);
    }
    return sharesWindow && lease.entry.tabId !== tabId && windowExclusive;
  });
}

type RequiredSize = { width: number; height: number };
type WindowCapacity = RequiredSize;

async function readViewportCapacity(
  args: { context: CaptureSurfaceContext; tabId: number },
  leases: readonly CaptureSurfaceLeaseState[]
): Promise<RequiredSize> {
  const rootViewportLease = leases.find(
    (lease) => lease.entry.tabId === args.tabId && lease.applied.target === 'viewport'
  );
  if (rootViewportLease?.prior.type === 'native') {
    return { width: rootViewportLease.prior.width, height: rootViewportLease.prior.height };
  }
  return readPageViewportCapacity(args.tabId);
}

type Measurement<T> = { ok: true; value: T } | { ok: false };

async function measure<T>(read: () => Promise<T>): Promise<Measurement<T>> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

function projectWindowAvailability(
  preset: ViewportPreset,
  measurement: Measurement<WindowCapacity>
): ViewportPresetAvailability {
  const required = { width: preset.width, height: preset.height };
  if (!measurement.ok) {
    return unavailable(preset.id, 'platform-rejected', { target: preset.target, required });
  }
  const capacity = measurement.value;
  const available = { width: capacity.width, height: capacity.height };
  return preset.width > capacity.width || preset.height > capacity.height
    ? unavailable(preset.id, 'window-too-large', {
        target: preset.target,
        required,
        available,
      })
    : { status: 'available', presetId: preset.id, target: preset.target, required };
}

function projectViewportAvailability(
  context: CaptureSurfaceContext,
  preset: ViewportPreset,
  measurement: Measurement<RequiredSize>,
  zoom: Measurement<number> | null
): ViewportPresetAvailability {
  const required = { width: preset.width, height: preset.height };
  if (isVideoContext(context)) {
    if (!zoom?.ok) {
      return unavailable(preset.id, 'platform-rejected', { target: preset.target, required });
    }
    if (zoom.value !== 1) {
      return unavailable(preset.id, 'zoom-not-100', { target: preset.target, required });
    }
  }
  if (!measurement.ok) {
    return unavailable(preset.id, 'platform-rejected', { target: preset.target, required });
  }
  const available = measurement.value;
  if (preset.width > available.width || preset.height > available.height) {
    return unavailable(preset.id, 'viewport-too-large', {
      target: preset.target,
      required,
      available,
    });
  }
  return isVideoContext(context)
    ? {
        status: 'requires-start-validation',
        presetId: preset.id,
        target: 'viewport',
        required,
      }
    : { status: 'available', presetId: preset.id, target: 'viewport', required };
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
  if (!preset) return unavailable(presetId, 'missing');
  const required = { width: preset.width, height: preset.height };
  if (!preset.enabled) {
    return unavailable(preset.id, 'disabled', { target: preset.target, required });
  }
  if (context === 'video-screen') {
    return unavailable(preset.id, 'unsupported-context', { target: preset.target, required });
  }
  if (windowId === null) {
    return unavailable(preset.id, 'unsupported-context', { target: preset.target, required });
  }
  if (hasCaptureSurfaceConflict(leaseStates, tabId, windowId, preset.target)) {
    return unavailable(preset.id, 'surface-busy', { target: preset.target, required });
  }
  return null;
}

export async function getCaptureSurfaceAvailabilities(
  args: {
    tabId: number;
    presetIds: readonly string[];
    context: CaptureSurfaceContext;
  },
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
  const measurable = requested.filter(({ preset, presetId }) =>
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
  const needsViewport = measurable.some(({ preset }) => preset?.target === 'viewport');
  const needsWindow = measurable.some(({ preset }) => preset?.target === 'window');
  const [viewportMeasurement, windowMeasurement, zoomMeasurement] = await Promise.all([
    needsViewport
      ? measure(() => readViewportCapacity(args, leaseStates))
      : Promise.resolve<Measurement<RequiredSize>>({ ok: false }),
    needsWindow && windowId !== null
      ? measure(async () => {
          const { workArea } = await getWindowWorkArea(windowId);
          return { width: workArea.width, height: workArea.height };
        })
      : Promise.resolve<Measurement<WindowCapacity>>({ ok: false }),
    needsViewport && isVideoContext(args.context)
      ? measure(() => getTabZoom(args.tabId))
      : Promise.resolve<Measurement<number> | null>(null),
  ]);

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
    return preset!.target === 'window'
      ? projectWindowAvailability(preset!, windowMeasurement)
      : projectViewportAvailability(args.context, preset!, viewportMeasurement, zoomMeasurement);
  });
}

export async function getCaptureSurfaceAvailability(
  args: {
    tabId: number;
    presetId: string;
    context: CaptureSurfaceContext;
  },
  leases: Iterable<CaptureSurfaceLeaseState>
): Promise<ViewportPresetAvailability> {
  const [availability] = await getCaptureSurfaceAvailabilities(
    { tabId: args.tabId, presetIds: [args.presetId], context: args.context },
    leases
  );
  return availability!;
}
