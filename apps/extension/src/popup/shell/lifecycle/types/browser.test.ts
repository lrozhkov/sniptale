import { expectTypeOf, it } from 'vitest';

import type { PopupLifecycleBrowserListenerParams as FacadePopupLifecycleBrowserListenerParams } from './index';
import type { PopupLifecycleBrowserListenerParams as RolePopupLifecycleBrowserListenerParams } from './browser';

it('keeps browser listener params aligned with the facade', () => {
  expectTypeOf<FacadePopupLifecycleBrowserListenerParams>().toMatchTypeOf<RolePopupLifecycleBrowserListenerParams>();
});
