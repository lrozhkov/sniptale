import { clearAllSniptaleIds } from '../../../../platform/frame';
import { handleResumeAiPickMode } from './mode';
import type { AiPickControllerContext } from './types';

type AiPickControllerResetContext = Pick<
  AiPickControllerContext,
  | 'cancelActiveAiRequest'
  | 'invalidateAiPickEnableSession'
  | 'setIsAILoading'
  | 'setIsAIModalOpen'
  | 'setTreeData'
>;

export function resetAiPickControllerAfterHistoryApply(context: AiPickControllerResetContext) {
  context.invalidateAiPickEnableSession();
  clearAllSniptaleIds();
  context.cancelActiveAiRequest();
  context.setIsAILoading(false);
  context.setIsAIModalOpen(false);
  context.setTreeData(null);
}

export function handleCloseAIModal(context: AiPickControllerContext) {
  context.invalidateAiPickEnableSession();
  clearAllSniptaleIds();
  context.cancelActiveAiRequest();
  context.setIsAIModalOpen(false);
  context.setTreeData(null);
  handleResumeAiPickMode(context);
}
