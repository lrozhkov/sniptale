import { expectTypeOf, it } from 'vitest';

import type {
  BlurStrokeStyle,
  CalloutAnchor,
  CalloutSide,
  CalloutVariant,
  HighlighterState,
  HighlightRect,
  QuickEditState,
  StepBadgeCorner,
  StepBadgeSize,
  UIState,
} from './index';

type RetainedHighlighterFacadeTypes = {
  blurStrokeStyle: BlurStrokeStyle;
  calloutAnchor: CalloutAnchor;
  calloutSide: CalloutSide;
  calloutVariant: CalloutVariant;
  highlighterState: HighlighterState;
  highlightRect: HighlightRect;
  quickEditState: QuickEditState;
  stepBadgeCorner: StepBadgeCorner;
  stepBadgeSize: StepBadgeSize;
  uiState: UIState;
};

it('keeps legacy highlighter contract facade types available while owners migrate', () => {
  expectTypeOf<RetainedHighlighterFacadeTypes>().toMatchTypeOf<Record<string, unknown>>();
});
