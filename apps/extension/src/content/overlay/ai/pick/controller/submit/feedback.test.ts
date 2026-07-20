import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showToastMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
}));

vi.mock('../../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

import { showAiApplyToast, showAiNoChangesInfo, showAiParseErrors } from './feedback';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ai-pick-controller-submit-feedback', () => {
  it('does nothing when there are no parse errors', () => {
    showAiParseErrors([]);

    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('shows parse error feedback as warning toast', () => {
    showAiParseErrors(['bad json fragment', 'bad selector']);

    expect(showToastMock).toHaveBeenCalledWith(
      'content.toolbar.aiParseErrorsPrefix bad json fragment; bad selector',
      'warning'
    );
  });

  it('shows no-change info toast', () => {
    showAiNoChangesInfo();

    expect(showToastMock).toHaveBeenCalledWith('content.toolbar.aiNoChanges', 'info');
  });

  it('shows warning success summary when some targets were not found', () => {
    showAiApplyToast(1, 2);

    expect(showToastMock).toHaveBeenCalledWith(
      'content.toolbar.aiAppliedWithMissingPrefix1content.toolbar.aiAppliedWithMissingMiddle2',
      'warning'
    );
  });

  it('shows success summary when all targets were applied', () => {
    showAiApplyToast(1, 0);

    expect(showToastMock).toHaveBeenCalledWith(
      'content.toolbar.aiAppliedSuccessPrefix1content.toolbar.aiAppliedSuccessSuffix',
      'success'
    );
  });
});
