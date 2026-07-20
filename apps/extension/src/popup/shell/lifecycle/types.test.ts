import { expectTypeOf, it } from 'vitest';

import type {
  PopupLifecycleBootstrapParams as FacadeBootstrapParams,
  PopupLifecycleBootstrapParamsGetter as FacadeBootstrapParamsGetter,
  PopupLifecycleBrowserListenerParams as FacadeBrowserListenerParams,
  PopupLifecycleBrowserListenerParamsGetter as FacadeBrowserListenerParamsGetter,
  PopupLifecycleMediaHubParams as FacadeMediaHubParams,
  PopupLifecycleMediaHubParamsGetter as FacadeMediaHubParamsGetter,
  PopupLifecycleParams as FacadePopupLifecycleParams,
  PopupLifecycleParamsGetter as FacadePopupLifecycleParamsGetter,
} from './types';
import type {
  PopupLifecycleBootstrapParams as RoleBootstrapParams,
  PopupLifecycleBootstrapParamsGetter as RoleBootstrapParamsGetter,
} from './types/bootstrap';
import type {
  PopupLifecycleBrowserListenerParams as RoleBrowserListenerParams,
  PopupLifecycleBrowserListenerParamsGetter as RoleBrowserListenerParamsGetter,
} from './types/browser';
import type {
  PopupLifecycleMediaHubParams as RoleMediaHubParams,
  PopupLifecycleMediaHubParamsGetter as RoleMediaHubParamsGetter,
} from './types/media-hub';
import type {
  PopupLifecycleParams as RolePopupLifecycleParams,
  PopupLifecycleParamsGetter as RolePopupLifecycleParamsGetter,
} from './types/params';

it('keeps popup lifecycle type facades aligned with the role files', () => {
  expectTypeOf<FacadePopupLifecycleParams>().toMatchTypeOf<RolePopupLifecycleParams>();
  expectTypeOf<FacadePopupLifecycleParamsGetter>().toMatchTypeOf<RolePopupLifecycleParamsGetter>();
  expectTypeOf<FacadeBootstrapParams>().toMatchTypeOf<RoleBootstrapParams>();
  expectTypeOf<FacadeBootstrapParamsGetter>().toMatchTypeOf<RoleBootstrapParamsGetter>();
  expectTypeOf<FacadeBrowserListenerParams>().toMatchTypeOf<RoleBrowserListenerParams>();
  expectTypeOf<FacadeBrowserListenerParamsGetter>().toMatchTypeOf<RoleBrowserListenerParamsGetter>();
  expectTypeOf<FacadeMediaHubParams>().toMatchTypeOf<RoleMediaHubParams>();
  expectTypeOf<FacadeMediaHubParamsGetter>().toMatchTypeOf<RoleMediaHubParamsGetter>();
});
