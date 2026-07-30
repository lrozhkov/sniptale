import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';

export type PageStyleMutationElement = HTMLElement | SVGElement;
export type CssDeclarationPriority = '' | 'important';
export type CssDeclarationPolicySource = 'inspector';

export interface CssDeclarationValue {
  priority: CssDeclarationPriority;
  value: string;
}

export interface CssDeclarationRequest {
  priority?: string;
  property: PageStyleProperty;
  source?: CssDeclarationPolicySource;
  value: string | null;
}

export interface CssDeclarationPolicy {
  source: CssDeclarationPolicySource;
}

export interface CssDeclarationDelta {
  after: CssDeclarationValue;
  afterPolicy: CssDeclarationPolicy;
  before: CssDeclarationValue;
  beforePolicy: CssDeclarationPolicy;
  order: number;
  property: PageStyleProperty;
}

export interface PageStyleMutationBatch {
  declarations: CssDeclarationDelta[];
  target: PageStyleMutationElement;
}

export interface PageStyleMutationInput {
  declarations: CssDeclarationRequest[];
  target: PageStyleMutationElement;
}

type PageStyleMutationFailureCode =
  | 'detached-target'
  | 'invalid-declaration'
  | 'mutation-failed'
  | 'rollback-failed'
  | 'stale-target-state';

export type PageStyleMutationResult =
  | {
      batch: PageStyleMutationBatch;
      status: 'applied';
    }
  | {
      code: PageStyleMutationFailureCode;
      message: string;
      recoveryBatch?: PageStyleMutationBatch;
      status: 'failed';
    };
