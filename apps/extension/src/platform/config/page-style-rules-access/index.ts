export function isPageStyleRulesUiEnabled(): boolean {
  if (typeof __ENABLE_PAGE_STYLE_RULES__ !== 'undefined') {
    return __ENABLE_PAGE_STYLE_RULES__;
  }

  return true;
}
