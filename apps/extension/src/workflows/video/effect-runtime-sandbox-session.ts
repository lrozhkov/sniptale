import { runtimeInfo } from '@sniptale/platform/browser/runtime';

import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { createEffectRuntimeFailure } from '../../contracts/effect-runtime/identity';
import {
  createEffectRuntimeSandboxConnectionNonce,
  createEffectRuntimeSandboxUrl,
  isEffectRuntimeSandboxReady,
} from '../../contracts/effect-runtime/sandbox-connection';
import {
  EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE,
  type EffectRuntimeFrameResult,
  type EffectRuntimeSceneResult,
  type EffectRuntimeRenderCommand,
} from '../../contracts/effect-runtime/types';
import type { PendingEffectRuntimeRequest } from './effect-runtime-sandbox-request';
import {
  renderEffectRuntimeSandboxFrame,
  type EffectRuntimeSandboxRenderAuthority,
  type EffectRuntimeSandboxSession,
} from './effect-runtime-sandbox-render';

export const EFFECT_RUNTIME_SANDBOX_PAGE_PATH =
  'apps/extension/src/effect-runtime-sandbox/index.html';

export class EffectRuntimeSandboxSessionManager {
  private readonly active = new Set<PendingEffectRuntimeRequest>();
  private readonly acknowledgedAssetSelections = new Set<string>();
  private readonly acknowledgedDocuments = new Set<string>();
  private disposed = false;
  private session: EffectRuntimeSandboxSession | null = null;

  constructor(
    private readonly ownerDocument: Document,
    private readonly configuration: {
      loadTimeoutMs: number;
      requestTimeoutMs: number;
      compositionBackend?: 'gpu-preview' | 'gpu-scene' | 'gpu-scene-plan';
    }
  ) {}

  /** Start transport readiness without admitting a frame; actual requests can retry a failed load. */
  preload(): void {
    if (this.disposed) return;
    try {
      this.ensureSession();
    } catch {
      this.clearSession();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearSession();
    for (const pending of this.active) {
      pending.finish(createEffectRuntimeFailure(pending.request, 'crashed'));
    }
  }

  async renderFrame(command: EffectRuntimeRenderCommand): Promise<EffectRuntimeFrameResult> {
    if (this.configuration.compositionBackend === 'gpu-scene-plan') {
      closeEffectRuntimeBitmaps(command.inputFrames);
      return createEffectRuntimeFailure(command, 'inputRejected');
    }
    return renderEffectRuntimeSandboxFrame(this.createRenderAuthority(), command);
  }

  async prepareGpuFrame(command: EffectRuntimeRenderCommand): Promise<EffectRuntimeSceneResult> {
    if (
      this.configuration.compositionBackend !== 'gpu-scene' &&
      this.configuration.compositionBackend !== 'gpu-scene-plan'
    ) {
      closeEffectRuntimeBitmaps(command.inputFrames);
      return createEffectRuntimeFailure(command, 'inputRejected');
    }
    const result = await renderEffectRuntimeSandboxFrame(
      this.createRenderAuthority(),
      command,
      'prepareGpuFrame'
    );
    if (this.configuration.compositionBackend === 'gpu-scene-plan' && result.kind === 'frame') {
      result.bitmap.close();
      return createEffectRuntimeFailure(command, 'outputRejected');
    }
    return result;
  }

  private createRenderAuthority(): EffectRuntimeSandboxRenderAuthority {
    return {
      active: this.active,
      acknowledgedAssetSelections: this.acknowledgedAssetSelections,
      acknowledgedDocuments: this.acknowledgedDocuments,
      clearAcknowledgements: () => this.clearAcknowledgements(),
      clearSession: (expected) => this.clearSession(expected),
      ensureSession: () => this.ensureSession(),
      isCurrentSession: (session) => this.session === session,
      isDisposed: () => this.disposed,
      requestTimeoutMs: this.configuration.requestTimeoutMs,
    };
  }

  private ensureSession(): EffectRuntimeSandboxSession {
    if (this.session) return this.session;
    const connectionNonce = createEffectRuntimeSandboxConnectionNonce();
    const iframe = createSandboxIframe(
      this.ownerDocument,
      connectionNonce,
      this.configuration.compositionBackend
    );
    const created: EffectRuntimeSandboxSession = {
      cancelLoad: () => {},
      controlPort: null,
      iframe,
      load: Promise.resolve(),
    };
    created.load = initializeSandboxSession(
      created,
      connectionNonce,
      this.configuration.loadTimeoutMs
    );
    this.session = created;
    void created.load.catch(() => this.clearSession(created));
    (this.ownerDocument.body ?? this.ownerDocument.documentElement).append(iframe);
    return created;
  }

  private clearAcknowledgements(): void {
    this.acknowledgedAssetSelections.clear();
    this.acknowledgedDocuments.clear();
  }

  private clearSession(expected: EffectRuntimeSandboxSession | null = this.session): void {
    if (!expected || this.session !== expected) return;
    this.session = null;
    this.clearAcknowledgements();
    expected.cancelLoad();
    expected.controlPort?.close();
    expected.controlPort = null;
    expected.iframe.remove();
  }
}

function createSandboxIframe(
  ownerDocument: Document,
  connectionNonce: string,
  compositionBackend?: 'gpu-preview' | 'gpu-scene' | 'gpu-scene-plan'
): HTMLIFrameElement {
  const iframe = ownerDocument.createElement('iframe');
  iframe.hidden = true;
  iframe.setAttribute('sandbox', 'allow-scripts');
  const url = new URL(runtimeInfo.getURL(EFFECT_RUNTIME_SANDBOX_PAGE_PATH));
  if (compositionBackend) url.searchParams.set('composition', compositionBackend);
  iframe.src = createEffectRuntimeSandboxUrl(url.href, connectionNonce);
  return iframe;
}

function initializeSandboxSession(
  session: EffectRuntimeSandboxSession,
  connectionNonce: string,
  timeoutMs: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session.iframe.removeEventListener('load', onLoad);
      session.iframe.removeEventListener('error', onError);
      if (session.controlPort) {
        session.controlPort.onmessage = null;
        session.controlPort.onmessageerror = null;
      }
      if (error) reject(error);
      else resolve();
    };
    const onLoad = (): void => {
      try {
        session.controlPort = connectSandbox(session.iframe, connectionNonce, finish);
      } catch {
        finish(new Error('EFFECT_RUNTIME_SANDBOX_CONNECT_FAILED'));
      }
    };
    const onError = (): void => finish(new Error('EFFECT_RUNTIME_SANDBOX_LOAD_FAILED'));
    const timer = setTimeout(
      () => finish(new Error('EFFECT_RUNTIME_SANDBOX_LOAD_TIMEOUT')),
      timeoutMs
    );
    session.cancelLoad = () => finish(new Error('EFFECT_RUNTIME_SANDBOX_LOAD_CANCELLED'));
    session.iframe.addEventListener('load', onLoad, { once: true });
    session.iframe.addEventListener('error', onError, { once: true });
  });
}

function connectSandbox(
  iframe: HTMLIFrameElement,
  connectionNonce: string,
  finish: (error?: Error) => void
): MessagePort {
  const target = iframe.contentWindow;
  if (!target) throw new Error('EFFECT_RUNTIME_SANDBOX_WINDOW_UNAVAILABLE');
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    if (event.ports.length === 0 && isEffectRuntimeSandboxReady(event.data, connectionNonce)) {
      finish();
      return;
    }
    for (const port of event.ports) port.close();
    closeEffectRuntimeBitmaps(event.data);
    finish(new Error('EFFECT_RUNTIME_SANDBOX_READY_INVALID'));
  };
  channel.port1.onmessageerror = () => finish(new Error('EFFECT_RUNTIME_SANDBOX_READY_MALFORMED'));
  channel.port1.start();
  try {
    target.postMessage(
      { connectionNonce, type: EFFECT_RUNTIME_SANDBOX_CONNECT_MESSAGE },
      { targetOrigin: '*', transfer: [channel.port2] }
    );
  } catch (error) {
    channel.port1.close();
    channel.port2.close();
    throw error;
  }
  return channel.port1;
}
