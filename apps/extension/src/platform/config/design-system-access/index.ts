export function isDesignSystemEnabled(): boolean {
  if (typeof __ENABLE_DESIGN_SYSTEM__ !== 'undefined') {
    return __ENABLE_DESIGN_SYSTEM__;
  }

  return true;
}
