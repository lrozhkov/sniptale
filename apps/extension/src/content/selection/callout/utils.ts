/**
 * Утилиты для позиционирования и рендеринга Callout
 */

export { FONT_FAMILY_MAP } from './constants';
export {
  getAnchorPosition,
  getCalloutPosition,
  getPreferredSideFromAnchor,
  pickBestSide,
} from './geometry';
export { getTailSvgState, getTailOffset } from './tail';
