let viewportPresetApplyGeneration = 0;

export function claimViewportPresetApplyGeneration(): number {
  viewportPresetApplyGeneration += 1;
  return viewportPresetApplyGeneration;
}

export function invalidateViewportPresetApplyGeneration(): void {
  viewportPresetApplyGeneration += 1;
}

export function isCurrentViewportPresetApplyGeneration(generation: number): boolean {
  return generation === viewportPresetApplyGeneration;
}
