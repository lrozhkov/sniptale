import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
  createGuideImageBlock,
} from '../../../features/scenario/project/public';
const io = vi.hoisted(() => ({
  record: vi.fn(),
  asset: vi.fn(),
  configuration: vi.fn(),
  token: vi.fn(),
  send: vi.fn(),
  frame: vi.fn(),
  dataUrl: vi.fn(),
}));
vi.mock('../../../composition/persistence/scenario/projects', () => ({
  getScenarioProjectEntry: io.record,
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: io.asset,
}));
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: io.configuration,
}));
vi.mock('../../../workflows/ai-session/llm-session', () => ({ requestLlmSessionToken: io.token }));
vi.mock('../../../platform/runtime-messaging', () => ({
  createRuntimeMessagingTransport: () => ({ sendRuntimeMessage: io.send }),
}));
vi.mock('../../../platform/media-utils/data-url', () => ({ blobToDataUrl: io.dataUrl }));
vi.mock('./image-frame', () => ({ renderGuideImageFrame: io.frame }));
import { loadGuideAiConfiguration, requestGuideAiProposal, verifyGuideAiBasis } from './ai-request';

function setup() {
  const project = createGuideProject('Private name', 'guide', 1);
  const step = createGuideStep('Selected', 'step');
  step.blocks = [{ kind: 'text', id: 'text', paragraphs: createGuideParagraphs('Before') }];
  project.items = [step, createGuideStep('Hidden', 'other')];
  io.record.mockResolvedValue({ project, workspaceRevision: 2 });
  io.token.mockResolvedValue('token');
  io.send.mockResolvedValue({
    success: true,
    operations: [{ type: 'setText', stepId: 'step', blockId: 'text', text: 'After' }],
  });
  const controller = new AbortController();
  return {
    project,
    step,
    controller,
    args: {
      project,
      scope: { stepIds: ['step'], blockIds: ['text'] },
      instruction: 'Clarify',
      modelId: 'model',
      includeImages: false,
      signal: controller.signal,
    },
  };
}
beforeEach(() => vi.resetAllMocks());
it('loads selector metadata without issuing an AI request and excludes unsupported built-in transport', async () => {
  io.configuration.mockResolvedValue({
    providers: [
      { id: 'local', connectionType: 'chrome-built-in' },
      { id: 'remote', connectionType: 'openai-compatible' },
    ],
    models: [
      { id: 'builtin', providerId: 'local' },
      { id: 'model', providerId: 'remote' },
    ],
    defaultModelId: 'builtin',
  });
  const config = await loadGuideAiConfiguration();
  expect(config.models.map((model) => model.id)).toEqual(['model']);
  expect(config.defaultModelId).toBe('model');
  expect(io.token).not.toHaveBeenCalled();
  expect(io.send).not.toHaveBeenCalled();
});
it('binds selected-only text and a committed revision to explicit authorized dispatch', async () => {
  const s = setup();
  const result = await requestGuideAiProposal(s.args);
  expect(result.baseRevision).toBe(2);
  expect(result.changes[0]).toMatchObject({ before: 'Before', after: 'After' });
  const payload = io.send.mock.calls[0]![0];
  expect(payload).toMatchObject({
    contractVersion: 4,
    baseRevision: 2,
    projectId: 'guide',
    llmSessionToken: 'token',
    attachments: [],
    modelId: 'model',
    scope: s.args.scope,
  });
  expect(JSON.parse(payload.projectSnapshotJson)).toEqual({
    scope: 'blocks',
    steps: [{ id: 'step', blocks: [{ id: 'text', kind: 'text', text: 'Before', parameters: {} }] }],
  });
  expect(payload.projectSnapshotJson).not.toMatch(/Hidden|Private name/);
  expect(io.asset).not.toHaveBeenCalled();
});
it('cancels preparation before dispatch and ignores a late provider response', async () => {
  const s = setup();
  io.token.mockImplementationOnce(async () => {
    s.controller.abort();
    return 'token';
  });
  await expect(requestGuideAiProposal(s.args)).rejects.toThrow();
  expect(io.send).not.toHaveBeenCalled();
  const next = setup();
  io.send.mockImplementationOnce(async () => {
    next.controller.abort();
    return { success: true, operations: [] };
  });
  await expect(requestGuideAiProposal(next.args)).rejects.toThrow();
});
it('rejects a changed committed basis before sending or accepting, and off-scope results', async () => {
  const s = setup();
  io.record.mockResolvedValueOnce({
    project: { ...s.project, updatedAt: 2 },
    workspaceRevision: 3,
  });
  await expect(requestGuideAiProposal(s.args)).rejects.toThrow('basis');
  expect(io.token).not.toHaveBeenCalled();
  await expect(verifyGuideAiBasis(s.project, s.controller.signal, 1)).rejects.toThrow('basis');
  io.send.mockResolvedValueOnce({
    success: true,
    operations: [{ type: 'setStepTitle', stepId: 'other', title: 'No' }],
  });
  await expect(requestGuideAiProposal(s.args)).rejects.toThrow('selection');
});
it('sends only explicitly opted-in rendered image frames with generic attachment names', async () => {
  const s = setup();
  s.step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'private-asset',
      width: 200,
      height: 100,
      source: { kind: 'import', filename: 'private-name.png' },
    })
  );
  const original = new Blob(['source']);
  const rendered = new Blob(['rendered'], { type: 'image/png' });
  io.asset.mockResolvedValue(original);
  io.frame.mockResolvedValue(rendered);
  io.dataUrl.mockResolvedValue('data:image/png;base64,AQIDBA==');
  await requestGuideAiProposal({
    ...s.args,
    scope: { stepIds: ['step'], blockIds: [] },
    includeImages: true,
  });
  expect(io.frame).toHaveBeenCalledWith(original, s.step.blocks[1], s.controller.signal, 1024);
  expect(io.dataUrl).toHaveBeenCalledWith(rendered);
  const payload = io.send.mock.calls[0]![0];
  expect(payload.attachments).toEqual([
    {
      dataUrl: 'data:image/png;base64,AQIDBA==',
      filename: 'frame-1.png',
      mimeType: 'image/png',
      stepId: 'step',
      stepNumber: 1,
    },
  ]);
  expect(JSON.stringify(payload)).not.toMatch(/private-asset|private-name/);
});
it('fails closed on missing images, excessive selection, token denial and provider failure', async () => {
  const s = setup();
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 200,
    height: 100,
    source: { kind: 'import', filename: 'image.png' },
  });
  s.step.blocks.push(image);
  const args = { ...s.args, scope: { stepIds: ['step'], blockIds: [] }, includeImages: true };
  await expect(requestGuideAiProposal(args)).rejects.toThrow('unavailable');
  expect(io.token).not.toHaveBeenCalled();
  s.step.blocks = Array.from({ length: 21 }, (_, index) => ({ ...image, id: `image-${index}` }));
  await expect(requestGuideAiProposal(args)).rejects.toThrow('Too many');
  expect(io.send).not.toHaveBeenCalled();
  const next = setup();
  io.token.mockRejectedValueOnce(new Error('denied'));
  await expect(requestGuideAiProposal(next.args)).rejects.toThrow('denied');
  expect(io.send).not.toHaveBeenCalled();
  io.send.mockResolvedValueOnce({ success: false });
  await expect(requestGuideAiProposal(next.args)).rejects.toThrow('unavailable');
});
it('checks limits and a revision changed during authorization before provider dispatch', async () => {
  const s = setup();
  await expect(
    requestGuideAiProposal({ ...s.args, instruction: 'x'.repeat(1_000_000) })
  ).rejects.toThrow();
  expect(io.token).not.toHaveBeenCalled();
  io.token.mockImplementationOnce(async () => {
    io.record.mockResolvedValue({ project: s.project, workspaceRevision: 3 });
    return 'token';
  });
  await expect(requestGuideAiProposal(s.args)).rejects.toThrow('basis');
  expect(io.send).not.toHaveBeenCalled();
});
