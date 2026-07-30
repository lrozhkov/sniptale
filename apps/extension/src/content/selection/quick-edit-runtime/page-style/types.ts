import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';

export type PageStyleMutationElement = HTMLElement | SVGElement;
export type CssDeclarationPriority = '' | 'important';
export type CssDeclarationPolicySource = 'inspector' | 'resolved-asset';

export interface CssDeclarationValue {
  priority: CssDeclarationPriority;
  value: string;
}

export interface CssDeclarationRequest {
  assetUrl?: string;
  priority?: string;
  property: PageStyleProperty;
  source?: CssDeclarationPolicySource;
  value: string | null;
}

export interface CssDeclarationPolicy {
  assetUrl?: string;
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

export interface PageStyleAttributeDelta {
  after: string | null;
  before: string | null;
  name: 'height' | 'src' | 'width';
}

export interface PageStyleTextDelta {
  after: string;
  before: string;
}

export interface PageStyleMutationBatch {
  attributes: PageStyleAttributeDelta[];
  declarations: CssDeclarationDelta[];
  target: PageStyleMutationElement;
  text: PageStyleTextDelta | null;
}

export interface PageStyleMutationInput {
  attributes?: Partial<Record<PageStyleAttributeDelta['name'], string | null>>;
  declarations: CssDeclarationRequest[];
  target: PageStyleMutationElement;
  text?: string;
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
