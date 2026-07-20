export const AI_OWNER_MAPPINGS = [
  {
    owner: 'background-ai-public-routes',
    productionFile: 'apps/extension/src/background/ai/routes.ts',
    reason:
      'The public AI route entrypoint is covered by its underlying route and authorization suites.',
    testFiles: [
      'apps/extension/src/background/ai/settings/route.test.ts',
      'apps/extension/src/background/ai/settings/secret-unlock-route.test.ts',
      'apps/extension/src/background/ai/llm/authorization/egress.test.ts',
      'apps/extension/src/background/ai/llm/session-route.test.ts',
    ],
  },
  {
    owner: 'ai-secret-unlock-authorization',
    productionFile: 'apps/extension/src/background/ai/settings/authorization/secret-unlock.ts',
    exclusive: true,
    reason:
      'AI secret unlock sender ownership is covered by the authorization and route status suites.',
    testFiles: [
      'apps/extension/src/background/ai/settings/authorization/secret-unlock.test.ts',
      'apps/extension/src/background/ai/settings/secret-unlock-route.status.test.ts',
    ],
  },
  {
    owner: 'ai-secret-unlock-route',
    productionFile: 'apps/extension/src/background/ai/settings/secret-unlock-route.ts',
    reason: 'AI unlock route authority and status disclosure are covered by unlock route suites.',
    testFiles: [
      'apps/extension/src/background/ai/settings/secret-unlock-route.test.ts',
      'apps/extension/src/background/ai/settings/secret-unlock-route.status.test.ts',
    ],
  },
  {
    owner: 'scenario-editor-llm-provider-route',
    productionFile: 'apps/extension/src/background/ai/llm/editor-router.ts',
    reason: 'Scenario editor provider egress is covered by v2/v3 route and optional-field suites.',
    testFiles: [
      'apps/extension/src/background/ai/llm/editor-router.test.ts',
      'apps/extension/src/background/ai/llm/editor-router.v3.test.ts',
      'apps/extension/src/background/ai/llm/editor-router.optional-fields.test.ts',
    ],
  },
  {
    owner: 'llm-session-route',
    productionFile: 'apps/extension/src/background/ai/llm/session-route.ts',
    exclusive: true,
    reason:
      'LLM session authorization and secret-lock handling are covered by session route tests.',
    testFiles: ['apps/extension/src/background/ai/llm/session-route.test.ts'],
  },
  {
    owner: 'ai-session-runtime-client',
    productionFile: 'apps/extension/src/workflows/ai-session/llm-session.ts',
    reason:
      'LLM session token transport and secret-unlock retry are covered by the AI session client suite.',
    testFiles: ['apps/extension/src/workflows/ai-session/llm-session.test.ts'],
  },
  {
    owner: 'ai-session-runtime-client',
    productionFile: 'apps/extension/src/workflows/ai-session/secret-unlock-session.ts',
    reason:
      'AI secret unlock transport polling and terminal states are covered by the unlock client suite.',
    testFiles: ['apps/extension/src/workflows/ai-session/secret-unlock-session.test.ts'],
  },
  {
    owner: 'llm-http-transport',
    productionFile: 'apps/extension/src/background/ai/llm/transport/http.ts',
    reason: 'LLM HTTP response bounds are covered by transport and request integration suites.',
    testFiles: [
      'apps/extension/src/background/ai/llm/transport/http.test.ts',
      'apps/extension/src/background/ai/llm/transport/request.test.ts',
    ],
  },
  {
    owner: 'chrome-ai-content-runner',
    productionFile: 'apps/extension/src/content/overlay/ai/pick/runtime/chrome/content-runner.ts',
    reason: 'Chrome AI content prompt egress is covered by the content runner fixtures.',
    testFiles: ['apps/extension/src/content/overlay/ai/pick/runtime/chrome/content-runner.test.ts'],
  },
  {
    owner: 'chrome-ai-scenario-runner',
    productionFile: 'apps/extension/src/scenario-editor/project/ai/chrome/scenario-runner.ts',
    reason: 'Chrome AI scenario prompt egress is covered by scenario runner fixtures.',
    testFiles: ['apps/extension/src/scenario-editor/project/ai/chrome/scenario-runner.test.ts'],
  },
  {
    owner: 'settings-ai-runtime-mutation-client',
    productionFile:
      'apps/extension/src/settings/sections/ai-providers/runtime/settings-mutations.ts',
    reason:
      'Settings AI mutation client and secret-status transport are covered by runtime client fixtures.',
    testFiles: [
      'apps/extension/src/settings/sections/ai-providers/runtime/secret-protection-status.test.ts',
    ],
  },
  {
    owner: 'settings-ai-runtime-secret-status-client',
    productionFile:
      'apps/extension/src/settings/sections/ai-providers/runtime/secret-protection-status.ts',
    reason: 'Settings AI secret protection status client is covered by runtime client fixtures.',
    testFiles: [
      'apps/extension/src/settings/sections/ai-providers/runtime/secret-protection-status.test.ts',
    ],
  },
  {
    owner: 'ai-payload-limits',
    productionFile: 'apps/extension/src/contracts/ai/payload-limits.ts',
    reason: 'AI payload byte and attachment policy is covered by focused payload limit fixtures.',
    testFiles: ['apps/extension/src/contracts/ai/payload-limits.test.ts'],
  },
  {
    allowCrossOwner: true,
    owner: 'llm-request-privacy-contract',
    productionFile: 'apps/extension/src/contracts/messaging/llm.ts',
    reason:
      'LLM request payload shape is covered by provider routing and privacy sanitizer suites.',
    testFiles: [
      'apps/extension/src/background/ai/llm/router-processing.test.ts',
      'packages/platform/src/security/ai-payload-input.test.ts',
      'packages/platform/src/security/ai-payload-privacy.test.ts',
    ],
  },
  {
    owner: 'shared-secret-redaction',
    productionFile: 'packages/platform/src/security/secret-redaction.ts',
    reason: 'Secret string redaction is covered directly and through tracer failure metadata.',
    testFiles: [
      'packages/platform/src/security/secret-redaction.test.ts',
      'packages/platform/src/observability/message-tracer/utils.test.ts',
    ],
  },
];
