import {
  FileSearch,
  ListMinus,
  MessageCircleQuestion,
  WandSparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { TranslationKey } from '../../../platform/i18n';
import type { BrowserDesignReviewAction } from '../../parser/page-preparation/annotations';

interface DesignReviewActionOption {
  action: BrowserDesignReviewAction;
  icon: LucideIcon;
  labelKey: TranslationKey;
}

export const DESIGN_REVIEW_ACTIONS: readonly DesignReviewActionOption[] = [
  { action: 'refine', icon: WandSparkles, labelKey: 'content.designReview.actionRefine' },
  { action: 'fix', icon: Wrench, labelKey: 'content.designReview.actionFix' },
  { action: 'simplify', icon: ListMinus, labelKey: 'content.designReview.actionSimplify' },
  { action: 'verify', icon: FileSearch, labelKey: 'content.designReview.actionVerify' },
  {
    action: 'explain',
    icon: MessageCircleQuestion,
    labelKey: 'content.designReview.actionExplain',
  },
];

export function getDesignReviewActionOption(
  action: BrowserDesignReviewAction | null | undefined
): DesignReviewActionOption {
  return (
    DESIGN_REVIEW_ACTIONS.find((option) => option.action === action) ?? DESIGN_REVIEW_ACTIONS[0]!
  );
}

export function getDesignReviewActionTone(action: BrowserDesignReviewAction): string {
  return action === 'fix'
    ? 'text-[var(--sniptale-color-danger)]'
    : 'text-[var(--sniptale-color-text-primary)]';
}
