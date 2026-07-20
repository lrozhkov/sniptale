import { translate } from '../../../../../platform/i18n';
import { validateCssString } from '../../../../../features/highlighter/css-sanitizer/css';
import type { BorderPresetCssValidation } from './types';

export function getBorderPresetCssValidation(customCss: string): BorderPresetCssValidation {
  if (!customCss.trim()) {
    return {
      cssError: null,
      hasBlockedProps: false,
    };
  }

  const result = validateCssString(customCss);
  if (result.rawError) {
    return {
      cssError: result.rawError,
      hasBlockedProps: false,
    };
  }

  if (result.hasBlockedProps) {
    return {
      cssError: `${translate('highlighter.editor.blockedPropertiesPrefix')} ${result.blockedProps.join(', ')}`,
      hasBlockedProps: true,
    };
  }

  return {
    cssError: null,
    hasBlockedProps: false,
  };
}
