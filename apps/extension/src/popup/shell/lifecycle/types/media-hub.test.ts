import { expectTypeOf, it } from 'vitest';

import type { PopupLifecycleMediaHubParams as FacadePopupLifecycleMediaHubParams } from './index';
import type { PopupLifecycleMediaHubParams as RolePopupLifecycleMediaHubParams } from './media-hub';

it('keeps media hub params aligned with the facade', () => {
  expectTypeOf<FacadePopupLifecycleMediaHubParams>().toMatchTypeOf<RolePopupLifecycleMediaHubParams>();
});
