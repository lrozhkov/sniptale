import { beforeEach, expect, it, vi } from 'vitest';
import { handleRasterToolMouseUp } from './up';

const mocks = vi.hoisted(() => ({
  finalizeLassoDraft: vi.fn(() => false),
  finalizeMarqueeDraft: vi.fn(() => false),
  finishBrushDraft: vi.fn(async () => false),
  finishEraserDraft: vi.fn(async () => false),
  finishGradientDraft: vi.fn(async () => false),
}));

vi.mock('../brush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../brush')>()),
  finishBrushDraft: mocks.finishBrushDraft,
}));

vi.mock('../edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../edit')>()),
  finishEraserDraft: mocks.finishEraserDraft,
}));

vi.mock('../fill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fill')>()),
  finishGradientDraft: mocks.finishGradientDraft,
}));

vi.mock('../selection/draft', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../selection/draft')>()),
  finalizeLassoDraft: mocks.finalizeLassoDraft,
  finalizeMarqueeDraft: mocks.finalizeMarqueeDraft,
}));

function createBindings(tool: string) {
  const session = { id: 'session' };
  return {
    getActiveTool: () => tool,
    getRasterToolSession: () => session,
    session,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('finalizes mouse-up through selection drafts before raster mutation drafts', async () => {
  const bindings = createBindings('fill');
  mocks.finalizeLassoDraft.mockReturnValueOnce(true);

  await expect(handleRasterToolMouseUp(bindings as never)).resolves.toBe(true);

  expect(mocks.finalizeMarqueeDraft).toHaveBeenCalledWith(bindings.session);
  expect(mocks.finalizeLassoDraft).toHaveBeenCalledWith(bindings.session);
  expect(mocks.finishEraserDraft).not.toHaveBeenCalled();
});

it('returns brush and eraser fallback handled state after draft owners decline', async () => {
  await expect(handleRasterToolMouseUp(createBindings('brush') as never)).resolves.toBe(true);
  await expect(handleRasterToolMouseUp(createBindings('eraser') as never)).resolves.toBe(true);
  await expect(handleRasterToolMouseUp(createBindings('fill') as never)).resolves.toBe(false);
  await expect(handleRasterToolMouseUp(createBindings('text') as never)).resolves.toBe(false);

  expect(mocks.finishEraserDraft).toHaveBeenCalled();
  expect(mocks.finishBrushDraft).toHaveBeenCalled();
  expect(mocks.finishGradientDraft).toHaveBeenCalled();
});
