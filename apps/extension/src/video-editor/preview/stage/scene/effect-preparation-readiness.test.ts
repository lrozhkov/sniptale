// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import type { EffectRuntimeSandboxExecutor } from '../../../../contracts/effect-runtime/types';
import {
  createEffectRuntimeFailure,
  isRecord,
} from '../../../../contracts/effect-runtime/identity';
import { EFFECT_RUNTIME_SANDBOX_READY_MESSAGE } from '../../../../contracts/effect-runtime/types';
import { readEffectRuntimeSandboxConnectionNonce } from '../../../../contracts/effect-runtime/sandbox-connection';
import type { GpuPreviewRenderer } from '../../../../features/video/composition/canvas/gpu-preview';
import { parseEffectRuntimeSnapshotDocument } from '../../../../features/video/composition/effect-runtime/runtime/snapshot-document';
import { createEffectHostClip } from '../../../../features/video/project/factories/overlay-clip';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { createNativeEffectPreparation } from './effect-preparation';
import type { PreviewSceneRenderInput } from './types';
import { createVideoEditorEffectRuntime } from '../../../runtime/effect-runtime';
import {
  createSandboxRenderRequest,
  FakeImageBitmap,
  installSynchronousMessageChannel,
} from '../../../../workflows/video/effect-runtime-sandbox.test-support';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: () => 'chrome-extension://test/effect-runtime-sandbox.html' },
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function futureInput(executor: EffectRuntimeSandboxExecutor): PreviewSceneRenderInput {
  const project = createProject([createVideoClip({ duration: 5, sourceDuration: 5 })]);
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
    'utf8'
  );
  const definition = parseEffectRuntimeSnapshotDocument({ source });
  const sha256 = 'a'.repeat(64);
  project.effectSnapshots = [
    {
      id: `effect:${sha256}`,
      source,
      sha256,
      documentId: definition.id,
      assets: [],
      kind: 'standalone',
      schemaVersion: 'sniptale.effect.v1',
      retainedByteLength: new TextEncoder().encode(source).byteLength,
    },
  ];
  project.effectInstances = [
    {
      id: 'future',
      snapshotId: `effect:${sha256}`,
      controls: {},
      duration: definition.duration,
      enabled: true,
      kind: 'standalone',
      playbackRate: 1,
      startTime: 2,
      target: { kind: 'scene' },
    },
  ];
  project.clips.push(
    createEffectHostClip({
      effectInstanceId: 'future',
      name: 'Future',
      startTime: 2,
      duration: definition.duration,
      trackId: project.tracks[0]!.id,
      projectWidth: project.width,
      projectHeight: project.height,
    })
  );
  return {
    project,
    currentTime: 1.1,
    canvas: document.createElement('canvas'),
    stage: null,
    videoRefs: { current: {} },
    imageBank: {},
    previewRasterSize: { width: 640, height: 360 },
    previewRenderer: 'gpu',
    effectRuntimeExecutor: () => executor,
    effectPreparation: {
      context: { project, signal: new AbortController().signal },
      project,
      time: 1.1,
    },
  };
}

it('recovers timed-out retained Native transport at upcoming preparation before the foreground request', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
  installSynchronousMessageChannel();
  const runtime = createVideoEditorEffectRuntime({ ownerDocument: document });
  const initial = document.querySelector('iframe');
  expect(initial).not.toBeNull();
  const isolated: EffectRuntimeSandboxExecutor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn(async (request) => createEffectRuntimeFailure(request, 'inputRejected')),
  };
  const advisory = createNativeEffectPreparation(() => isolated);
  const provider: GpuPreviewRenderer = {
    allocatedBytes: 0,
    dispose: vi.fn(),
    render: vi.fn(),
    preparePipelines: vi.fn(),
  };
  const ports: MessagePort[] = [];
  try {
    await vi.advanceTimersByTimeAsync(1500);
    expect(document.querySelector('iframe')).toBeNull();
    const input = futureInput(runtime.executor);
    advisory.update(input, provider);
    const replacement = document.querySelector('iframe');
    expect(replacement).not.toBeNull();
    if (!replacement) throw new Error('Expected transport recovery before foreground request');
    expect(replacement).not.toBe(initial);
    const command = { ...createSandboxRenderRequest(), frameIndex: 0, time: 0 };
    const requests: unknown[] = [];
    const isPort = (value: unknown): value is MessagePort =>
      isRecord(value) &&
      typeof value['postMessage'] === 'function' &&
      typeof value['start'] === 'function' &&
      typeof value['close'] === 'function';
    vi.spyOn(replacement.contentWindow!, 'postMessage').mockImplementation((message, options) => {
      const connectionNonce = readEffectRuntimeSandboxConnectionNonce(
        new URL(replacement.src).hash
      );
      expect(message).toMatchObject({ connectionNonce });
      if (
        !isRecord(options) ||
        !Array.isArray(options['transfer']) ||
        !isPort(options['transfer'][0])
      )
        throw new Error('Expected sandbox control port');
      const control = options['transfer'][0];
      ports.push(control);
      control.onmessage = (event) => {
        requests.push(event.data);
        expect(event.data).toMatchObject({
          request: { kind: 'prepareGpuFrame', requestId: command.requestId },
        });
        const response = event.ports[0];
        if (!response) throw new Error('Expected frame response port');
        response.postMessage({
          kind: 'frame',
          bitmap: new FakeImageBitmap(command.renderWidth, command.renderHeight),
          width: command.renderWidth,
          height: command.renderHeight,
          effectInstanceId: command.effectInstanceId,
          requestId: command.requestId,
          sequenceId: command.sequenceId,
          snapshotId: command.snapshotId,
          acknowledged: {
            documentId: command.documentRef.id,
            assetSelectionId: command.assetSelectionRef.id,
          },
        });
      };
      control.start();
      control.postMessage({ connectionNonce, type: EFFECT_RUNTIME_SANDBOX_READY_MESSAGE });
    });
    replacement.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toEqual([]);
    advisory.update(input, provider);
    expect(document.querySelector('iframe')).toBe(replacement);
    advisory.dispose();
    expect(document.querySelector('iframe')).toBe(replacement);
    await expect(runtime.executor.prepareGpuFrame!(command)).resolves.toMatchObject({
      kind: 'frame',
    });
    expect(requests).toHaveLength(1);
    expect(document.querySelector('iframe')).toBe(replacement);
    runtime.dispose();
    expect(document.querySelector('iframe')).toBeNull();
  } finally {
    advisory.dispose();
    runtime.dispose();
    for (const port of ports) port.close();
  }
});
