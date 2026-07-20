export { createActionContext } from './context';
export { dispatchAction } from './dispatcher';
export { adaptImmediateLegacyRouteToAction, adaptTabLegacyRouteToAction } from './legacy-adapter';
export {
  actionRouteMetadata,
  getActionRouteHandler,
  getActionRouteMetadata,
  legacyActionRouteRegistry,
} from './registry';
export { getActionRouteMessageTypesByKind } from './routes';
export type {
  Action,
  ActionContext,
  ActionResult,
  ActionRouteMetadata,
  LegacyRouteName,
} from './types';
