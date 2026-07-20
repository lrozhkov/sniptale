import { expectTypeOf, it } from 'vitest';

import type { PopupLifecycleBootstrapParams as FacadePopupLifecycleBootstrapParams } from './index';
import type { PopupLifecycleBootstrapParams as RolePopupLifecycleBootstrapParams } from './bootstrap';

it('keeps bootstrap params aligned with the facade', () => {
  expectTypeOf<FacadePopupLifecycleBootstrapParams>().toMatchTypeOf<RolePopupLifecycleBootstrapParams>();
});
