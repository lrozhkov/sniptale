export const mutationProfiles = {
  persistence: {
    mutate: [
      'apps/extension/src/composition/persistence/assets/publication.ts',
      'apps/extension/src/composition/persistence/assets/recovery.ts',
      'apps/extension/src/composition/persistence/infrastructure/mutation-barrier.ts',
      'apps/extension/src/background/application/privacy-erasure/use-case.ts',
    ],
  },
  secrets: {
    mutate: [
      'apps/extension/src/background/ai/llm/transport/request.ts',
      'packages/platform/src/observability/diagnostics/sanitizer.ts',
      'packages/platform/src/observability/diagnostics/sanitizer.core.ts',
    ],
  },
};
