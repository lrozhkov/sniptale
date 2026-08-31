import { expect, it, vi } from 'vitest';
import { createCropDrawWorkflowState } from './completion-crop';

it('publishes completed crop state only after updating the Fabric selection', () => {
  const canvas = {
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const completion = {
    cropGuide: { id: 'crop-guide' },
    cropSelection: { height: 60, left: 10, top: 20, width: 100 },
    drawSession: null,
    kind: 'crop' as const,
  };

  expect(createCropDrawWorkflowState(canvas as never, completion as never)).toEqual({
    cropGuide: completion.cropGuide,
    cropSelection: completion.cropSelection,
    drawSession: null,
  });
  expect(canvas.setActiveObject).toHaveBeenCalledWith(completion.cropGuide);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
});
