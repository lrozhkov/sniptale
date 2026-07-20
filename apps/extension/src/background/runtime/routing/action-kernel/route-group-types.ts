import type {
  ActionKind,
  ActionRouteAuthorityFamily,
  ActionRouteHandlerAdapter,
  ActionRouteKeepChannelBehaviorSource,
} from './types';

export type ParserSupportedActionKind = Exclude<ActionKind, 'internal-signal' | 'unknown'>;

export type ActionRouteGroup = {
  readonly actionKind: ParserSupportedActionKind;
  readonly alternateAuthorityFamilies?: readonly ActionRouteAuthorityFamily[];
  readonly authorityFamily: ActionRouteAuthorityFamily;
  readonly handlerAdapter: ActionRouteHandlerAdapter;
  readonly keepChannelBehaviorSource: ActionRouteKeepChannelBehaviorSource;
  readonly messageTypes: readonly string[];
  readonly ownerModule: string;
};
