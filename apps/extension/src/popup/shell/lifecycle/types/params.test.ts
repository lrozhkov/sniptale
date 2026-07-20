import { expectTypeOf, it } from 'vitest';

import type { PopupLifecycleParams as FacadePopupLifecycleParams } from './index';
import type { PopupLifecycleParams as RolePopupLifecycleParams } from './params';

it('keeps popup params aligned with the facade', () => {
  expectTypeOf<FacadePopupLifecycleParams>().toMatchTypeOf<RolePopupLifecycleParams>();
});
