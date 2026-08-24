import { defineConfig } from 'vitest/config';

const profile = process.env['SNIPTALE_MUTATION_PROFILE'];
const include =
  profile === 'persistence'
    ? [
        'apps/extension/src/composition/persistence/assets/publication.test.ts',
        'apps/extension/src/composition/persistence/assets/fault-state-machine.test.ts',
        'apps/extension/src/composition/persistence/infrastructure/mutation-barrier.test.ts',
        'apps/extension/src/background/application/privacy-erasure/use-case.test.ts',
        'apps/extension/src/background/application/privacy-erasure/use-case.native-ingestion.test.ts',
      ]
    : profile === 'secrets'
      ? [
          'apps/extension/src/background/ai/llm/transport/request.test.ts',
          'apps/extension/src/background/ai/llm/transport/request.status.test.ts',
          'apps/extension/src/background/ai/llm/transport/request.base-url-policy.test.ts',
          'packages/platform/src/observability/diagnostics/sanitizer.test.ts',
        ]
      : (() => {
          throw new Error(`Unknown mutation profile: ${String(profile)}`);
        })();

export default defineConfig({
  test: {
    include,
    setupFiles: ['./tooling/test/harness/vitest.setup.ts'],
    ...(process.env['SNIPTALE_MUTATION_RUN_LABEL'] === 'baseline-fixed'
      ? { testNamePattern: /^(?!.*maps secret-bearing network failures)/u }
      : {}),
  },
});
