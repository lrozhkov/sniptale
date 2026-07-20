import { expectTypeOf, it } from 'vitest';

import type {
  PopupExportRequestHandlerProps as FacadeRequestHandlerProps,
  PopupExportRequestHandlerRuntime as FacadeRequestHandlerRuntime,
  PopupExportRunner as FacadePopupExportRunner,
} from './types';
import type {
  PopupExportRequestHandlerRuntime as RoleRequestHandlerRuntime,
  PopupExportRunner as RolePopupExportRunner,
} from './types/runtime';
import type { PopupExportRequestHandlerProps as RoleRequestHandlerProps } from './types/request';

it('keeps request-handler type facades aligned with the runtime role file', () => {
  expectTypeOf<FacadePopupExportRunner>().toMatchTypeOf<RolePopupExportRunner>();
  expectTypeOf<FacadeRequestHandlerRuntime>().toMatchTypeOf<RoleRequestHandlerRuntime>();
  expectTypeOf<FacadeRequestHandlerProps>().toMatchTypeOf<RoleRequestHandlerProps>();
});
