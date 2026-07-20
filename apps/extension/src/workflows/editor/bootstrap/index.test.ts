import { beforeEach, describe, expect, it, vi } from 'vitest';

const editorBootstrapMocks = vi.hoisted(() => ({
  consumePersistedEditorBootstrapPayloadMock: vi.fn(),
  eraseEditorBootstrapRetentionDataMock: vi.fn(),
  initializeEditorBootstrapRetentionMock: vi.fn(),
  persistEditorBootstrapPayloadMock: vi.fn(),
  purgeExpiredEditorBootstrapRetentionDataMock: vi.fn(),
  verifyEditorBootstrapRetentionEmptyMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/editor-bootstrap/retention', () => ({
  consumePersistedEditorBootstrapPayload:
    editorBootstrapMocks.consumePersistedEditorBootstrapPayloadMock,
  eraseEditorBootstrapRetentionData: editorBootstrapMocks.eraseEditorBootstrapRetentionDataMock,
  initializeEditorBootstrapRetention: editorBootstrapMocks.initializeEditorBootstrapRetentionMock,
  persistEditorBootstrapPayload: editorBootstrapMocks.persistEditorBootstrapPayloadMock,
  purgeExpiredEditorBootstrapRetentionData:
    editorBootstrapMocks.purgeExpiredEditorBootstrapRetentionDataMock,
  verifyEditorBootstrapRetentionEmpty: editorBootstrapMocks.verifyEditorBootstrapRetentionEmptyMock,
}));

async function importEditorBootstrapModule() {
  vi.resetModules();
  return import('./index');
}

beforeEach(() => {
  vi.clearAllMocks();
  editorBootstrapMocks.persistEditorBootstrapPayloadMock.mockResolvedValue('bootstrap-1');
  editorBootstrapMocks.consumePersistedEditorBootstrapPayloadMock.mockResolvedValue(null);
});

describe('editor-bootstrap in-memory payload flow', () => {
  it('primes and consumes the in-memory payload before touching persisted storage', async () => {
    const { consumePendingEditorBootstrapPayload, primePendingEditorBootstrapPayload } =
      await importEditorBootstrapModule();

    primePendingEditorBootstrapPayload({
      dataUrl: 'data:image/png;base64,local',
      title: 'Local title',
      url: 'https://local.test',
    });

    await expect(consumePendingEditorBootstrapPayload('bootstrap-id')).resolves.toEqual({
      dataUrl: 'data:image/png;base64,local',
      title: 'Local title',
      url: 'https://local.test',
    });
    await expect(consumePendingEditorBootstrapPayload()).resolves.toBeNull();
    expect(editorBootstrapMocks.consumePersistedEditorBootstrapPayloadMock).not.toHaveBeenCalled();
  });
});

describe('editor-bootstrap persisted payload delegation', () => {
  it('delegates persisted payload writes to the explicit retention owner', async () => {
    const { persistPendingEditorBootstrapPayload } = await importEditorBootstrapModule();

    await expect(
      persistPendingEditorBootstrapPayload({
        dataUrl: 'data:image/png;base64,persisted',
        title: 'Persisted title',
      })
    ).resolves.toBe('bootstrap-1');

    expect(editorBootstrapMocks.persistEditorBootstrapPayloadMock).toHaveBeenCalledWith({
      dataUrl: 'data:image/png;base64,persisted',
      title: 'Persisted title',
    });
  });

  it('delegates persisted payload reads to the explicit retention owner', async () => {
    editorBootstrapMocks.consumePersistedEditorBootstrapPayloadMock.mockResolvedValue({
      dataUrl: 'data:image/png;base64,restored',
      title: 'Persisted title',
      url: 'https://persisted.test',
    });
    const { consumePendingEditorBootstrapPayload } = await importEditorBootstrapModule();

    await expect(consumePendingEditorBootstrapPayload('bootstrap-id')).resolves.toEqual({
      dataUrl: 'data:image/png;base64,restored',
      title: 'Persisted title',
      url: 'https://persisted.test',
    });
    expect(editorBootstrapMocks.consumePersistedEditorBootstrapPayloadMock).toHaveBeenCalledWith(
      'bootstrap-id'
    );
  });
});
