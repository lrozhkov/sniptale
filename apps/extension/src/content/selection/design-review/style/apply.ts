import type { PageStyleDeclaration, PageStylePatch } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleRuntimeDiagnostic } from './diagnostics';
import { createPageStyleRuntimeDiagnostic } from './diagnostics';
import { applyPageStyleMutation } from './mutation';
import type {
  CssDeclarationRequest,
  PageStyleMutationBatch,
  PageStyleMutationElement,
  PageStyleMutationInput,
} from './types';
import { validateCssDeclaration } from './validation';

export interface PageStylePatchApplyResult {
  applied: boolean;
  diagnostics: PageStyleRuntimeDiagnostic[];
  mutation: PageStyleMutationBatch | null;
  recoveryMutation: PageStyleMutationBatch | null;
}

interface PreparedPageStylePatchMutation {
  diagnostics: PageStyleRuntimeDiagnostic[];
  input: PageStyleMutationInput;
  operationId: string;
}

function appendValidatedDeclaration(args: {
  declaration: PageStyleDeclaration;
  declarations: CssDeclarationRequest[];
  diagnostics: PageStyleRuntimeDiagnostic[];
  element: PageStyleMutationElement;
  operationId: string;
}): void {
  const validated = validateCssDeclaration(args.element, args.declaration);
  if (validated.status === 'invalid') {
    args.diagnostics.push(
      createPageStyleRuntimeDiagnostic('error', validated.message, args.operationId)
    );
    return;
  }

  args.declarations.push({
    priority: validated.priority,
    property: validated.property,
    source: validated.source,
    value: validated.value,
  });
}

export function preparePageStylePatchMutation(args: {
  element: PageStyleMutationElement;
  operationId: string;
  patch: PageStylePatch;
}): PreparedPageStylePatchMutation {
  const diagnostics: PageStyleRuntimeDiagnostic[] = [];
  const declarations: CssDeclarationRequest[] = [];
  args.patch.declarations.forEach((declaration) =>
    appendValidatedDeclaration({ ...args, declaration, declarations, diagnostics })
  );

  return {
    diagnostics,
    input: { declarations, target: args.element },
    operationId: args.operationId,
  };
}

export function applyPreparedPageStylePatchMutation(
  prepared: PreparedPageStylePatchMutation
): PageStylePatchApplyResult {
  const diagnostics = [...prepared.diagnostics];
  if (diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
    return {
      applied: false,
      diagnostics,
      mutation: null,
      recoveryMutation: null,
    };
  }

  const result = applyPageStyleMutation(prepared.input);
  if (result.status === 'failed') {
    diagnostics.push(
      createPageStyleRuntimeDiagnostic('error', result.message, prepared.operationId)
    );
    return {
      applied: false,
      diagnostics,
      mutation: null,
      recoveryMutation: result.recoveryBatch ?? null,
    };
  }

  return {
    applied: true,
    diagnostics,
    mutation: result.batch,
    recoveryMutation: null,
  };
}

export function applyPageStylePatch(args: {
  element: PageStyleMutationElement;
  operationId: string;
  patch: PageStylePatch;
}): PageStylePatchApplyResult {
  return applyPreparedPageStylePatchMutation(preparePageStylePatchMutation(args));
}
