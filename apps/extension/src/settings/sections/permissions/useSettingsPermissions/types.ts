import type { Dispatch, SetStateAction } from 'react';

import type { PermissionInfo } from '../permissions-lib';

export type PermissionSetter = Dispatch<SetStateAction<PermissionInfo[]>>;
