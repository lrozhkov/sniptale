export const SCENARIO_AI_OWNER_MAPPINGS = [
  {
    owner: 'scenario-ai-submit',
    productionFile: 'apps/extension/src/scenario-editor/project/ai/submit-action.ts',
    exclusive: true,
    reason: 'Scenario AI submit payload changes are covered by focused submit tests.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/ai/index.test.tsx',
      'apps/extension/src/scenario-editor/project/ai/submit-action.stale.test.ts',
    ],
  },
  {
    owner: 'scenario-ai-deck-submit',
    productionFile: 'apps/extension/src/scenario-editor/project/ai/deck-submit-action.ts',
    exclusive: true,
    reason: 'Scenario AI deck submit payload changes are covered by focused deck submit tests.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/ai/deck-submit-action.test.ts',
      'apps/extension/src/scenario-editor/project/ai/deck-submit-action.stale.test.ts',
      'apps/extension/src/scenario-editor/project/ai/deck-submit-action.summary.test.ts',
    ],
  },
  {
    owner: 'scenario-ai-attachments',
    productionPrefix: 'apps/extension/src/scenario-editor/project/ai/attachments/',
    exclusive: true,
    reason:
      'Scenario AI attachment payload and rendering changes are covered by focused attachment suites.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/ai/attachments/index.test.ts',
      'apps/extension/src/scenario-editor/project/ai/attachments/overlays.test.ts',
      'apps/extension/src/scenario-editor/project/ai/attachments/render/candidate.test.ts',
      'apps/extension/src/scenario-editor/project/ai/attachments/render/image.test.ts',
      'apps/extension/src/scenario-editor/project/ai/attachments/render/pick.test.ts',
      'apps/extension/src/scenario-editor/project/ai/attachments/render/render.test.ts',
    ],
  },
  {
    owner: 'scenario-ai-deck-payload',
    productionPrefix: 'apps/extension/src/scenario-editor/project/ai/deck-payload/',
    exclusive: true,
    reason:
      'Scenario AI deck payload and slide-code changes are covered by focused deck payload suites.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/ai/deck-payload/index.test.ts',
      'apps/extension/src/scenario-editor/project/ai/deck-payload/slide-code/serialize.test.ts',
    ],
  },
  {
    owner: 'scenario-ai-disclosure',
    productionPrefix: 'apps/extension/src/scenario-editor/project/ai/disclosure/',
    exclusive: true,
    reason: 'Scenario AI disclosure summary changes are covered by focused disclosure tests.',
    testFiles: ['apps/extension/src/scenario-editor/project/ai/disclosure/summary.test.ts'],
  },
  {
    owner: 'scenario-ai-operations',
    productionPrefix: 'apps/extension/src/scenario-editor/project/ai/operations/',
    exclusive: true,
    reason:
      'Scenario AI operation parsing and application changes are covered by focused operation suites.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/ai/operations/apply.test.ts',
      'apps/extension/src/scenario-editor/project/ai/operations/operations.test.ts',
      'apps/extension/src/scenario-editor/project/ai/operations/handlers/presentation.test.ts',
    ],
  },
  {
    owner: 'scenario-ai-response-apply',
    productionPrefix: 'apps/extension/src/scenario-editor/project/ai/response-apply/',
    exclusive: true,
    reason:
      'Scenario AI response application changes are covered by focused response-apply suites.',
    testFiles: [
      'apps/extension/src/scenario-editor/project/ai/response-apply/capture-step-patch.test.ts',
      'apps/extension/src/scenario-editor/project/ai/response-apply/contract.test.ts',
      'apps/extension/src/scenario-editor/project/ai/response-apply/focus-transform.test.ts',
      'apps/extension/src/scenario-editor/project/ai/response-apply/guards.test.ts',
      'apps/extension/src/scenario-editor/project/ai/response-apply/index.test.ts',
      'apps/extension/src/scenario-editor/project/ai/response-apply/overlay-patches.test.ts',
      'apps/extension/src/scenario-editor/project/ai/response-apply/response.test.ts',
      'apps/extension/src/scenario-editor/project/ai/response-apply/response/apply.test.ts',
    ],
  },
  {
    owner: 'scenario-ai-redaction',
    productionFile: 'apps/extension/src/features/ai/scenario-redaction.ts',
    exclusive: true,
    reason:
      'Scenario AI redaction is covered through egress-authority and payload serialization suites.',
    testFiles: [
      'apps/extension/src/features/ai/egress-authority/index.test.ts',
      'apps/extension/src/scenario-editor/project/ai/attachments/index.test.ts',
      'apps/extension/src/scenario-editor/project/ai/deck-payload/slide-code/serialize.test.ts',
    ],
  },
];
