import type {
  PageStyleCurrentPageRuleSummary,
  PageStyleInspectorTab,
} from '@sniptale/runtime-contracts/page-style';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createPageStyleRuntimeController } from '../quick-edit-runtime/page-style';
import { dispatchPageStyleInspectorOpen } from './page-style-events';

const logger = createLogger({ namespace: 'ContentQuickEditPageStyle' });
const pageStyleRuntimeOwner = createLazyContentDefaultOwner(createPageStyleRuntimeController);

export function initializePageStyleRuntime(): void {
  void pageStyleRuntimeOwner
    .getOwner()
    .applyMatchingRestoreRules()
    .catch((error: unknown) => {
      logger.warn('Failed to apply page style restore rules during content startup', error);
    });
}

export function getPageStyleCurrentRuleSummary(): Promise<PageStyleCurrentPageRuleSummary> {
  return pageStyleRuntimeOwner.getOwner().getCurrentPageAppliedRuleSummary();
}

export function openPageStyleInspector(targetTab: PageStyleInspectorTab): void {
  pageStyleRuntimeOwner.getOwner().openInspector(targetTab);
  dispatchPageStyleInspectorOpen(targetTab);
}

export function disposePageStyleRuntime(): void {
  pageStyleRuntimeOwner.getOwnerIfCreated()?.dispose();
}
