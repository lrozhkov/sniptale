export type EffectV1GraphReferences = {
  controlIds: Set<string>;
  layerIds: Set<string>;
  trackIds: Set<string>;
};

export type EffectV1ReadReferences = EffectV1GraphReferences & {
  definitionIds: Set<string>;
  runtimeInputs: Set<string>;
};

export function createEffectV1ReadReferences(
  definitions: Record<string, unknown>,
  runtimeInputs: Set<string>,
  references: EffectV1GraphReferences
): EffectV1ReadReferences {
  return {
    ...references,
    definitionIds: new Set(Object.keys(definitions)),
    runtimeInputs,
  };
}
