import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import { CaptureSurfaceLeaseMutation } from './lease-mutation';
import { CaptureSurfaceLeasePreparation } from './lease-preparation';
import type {
  AppliedCaptureSurface,
  CaptureSurfaceLeaseRequest,
  CaptureSurfaceLeaseState,
} from './types';
import { CaptureSurfaceError } from './types';

function normalizeApplyError(error: unknown): CaptureSurfaceError {
  if (error instanceof CaptureSurfaceError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const codes = ['window-too-large', 'verification-failed', 'restore-impossible'] as const;
  const code = codes.find((candidate) => message.includes(candidate));
  return new CaptureSurfaceError(code ?? 'platform-rejected', message);
}

export class CaptureSurfaceLeaseApplication {
  private readonly mutation: CaptureSurfaceLeaseMutation;
  private readonly preparation: CaptureSurfaceLeasePreparation;

  constructor(registry: CaptureSurfaceLeaseRegistry) {
    this.mutation = new CaptureSurfaceLeaseMutation(registry);
    this.preparation = new CaptureSurfaceLeasePreparation(registry);
  }

  async apply(
    request: CaptureSurfaceLeaseRequest,
    options: { replaceCurrent?: boolean } = {}
  ): Promise<AppliedCaptureSurface> {
    const context = await this.preparation.resolveContext(request);
    const { parent, preset, stack, windowId } = context;
    const applied = this.preparation.createAppliedSurface(request, preset);
    const replaceCurrent = options.replaceCurrent === true;
    let state: CaptureSurfaceLeaseState | null = null;
    try {
      state = await this.preparation.prepareLease(request, applied, windowId, parent);
      await this.mutation.stage(state, parent, stack);
      await this.mutation.mutate(state);
      await this.mutation.commit({ parent, replaceCurrent, request, state });
      return applied;
    } catch (error) {
      try {
        if (state) await this.mutation.rollback(state, parent);
      } catch (rollbackError) {
        throw normalizeApplyError(rollbackError);
      }
      throw normalizeApplyError(error);
    }
  }
}
