import type { RuntimeVideoExportRequestByType, RuntimeVideoExportResponseByType } from './export';
import type {
  RuntimeVideoSessionRequestByType,
  RuntimeVideoSessionResponseByType,
} from './session';

export type RuntimeVideoRequestByType = RuntimeVideoSessionRequestByType &
  RuntimeVideoExportRequestByType;

export type RuntimeVideoResponseByType = RuntimeVideoSessionResponseByType &
  RuntimeVideoExportResponseByType;
