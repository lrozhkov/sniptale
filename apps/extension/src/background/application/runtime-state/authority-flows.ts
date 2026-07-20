import type { RuntimeStateAuthorityFlow } from './authority-flow-types';
import { CORE_RUNTIME_STATE_AUTHORITY_FLOWS } from './authority-flows-core';
import { SUPPORT_RUNTIME_STATE_AUTHORITY_FLOWS } from './authority-flows-support';

export type { RuntimeStateAuthorityFlowId } from './authority-flow-types';

export const RUNTIME_STATE_AUTHORITY_FLOWS = [
  ...CORE_RUNTIME_STATE_AUTHORITY_FLOWS,
  ...SUPPORT_RUNTIME_STATE_AUTHORITY_FLOWS,
] as const satisfies readonly RuntimeStateAuthorityFlow[];
