import { describe, expect, it, vi } from 'vitest';

const { getOverlayControlsSaveTooltipCopyMock } = vi.hoisted(() => ({
  getOverlayControlsSaveTooltipCopyMock: vi.fn(),
}));

vi.mock('../../controls/tooltip-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../controls/tooltip-copy')>()),
  getOverlayControlsSaveTooltipCopy: getOverlayControlsSaveTooltipCopyMock,
}));

import { getSelectionModeSizePanelCopy } from './constants';

describe('selection-mode ui constants', () => {
  it('delegates size-panel copy to the shared overlay controls helper', () => {
    getOverlayControlsSaveTooltipCopyMock.mockReturnValue({ confirm: 'save' });

    expect(getSelectionModeSizePanelCopy()).toEqual({ confirm: 'save' });
    expect(getOverlayControlsSaveTooltipCopyMock).toHaveBeenCalledTimes(1);
  });
});
