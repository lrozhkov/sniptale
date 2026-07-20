interface ScenarioMutationMetadata {
  createdAt: number;
  updatedAt: number;
}

/**
 * Returns the canonical timestamp for scenario mutation metadata.
 */
export function getScenarioMutationTimestamp(): number {
  return Date.now();
}

/**
 * Creates a stable pair of mutation timestamps for entities that need both createdAt and updatedAt.
 */
export function createScenarioMutationMetadata(): ScenarioMutationMetadata {
  const timestamp = getScenarioMutationTimestamp();

  return {
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
