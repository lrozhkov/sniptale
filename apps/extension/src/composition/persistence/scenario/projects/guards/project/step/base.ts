import type { ScenarioNoteTone } from '@sniptale/runtime-contracts/scenario/types/base';
import { parseBody, parseNumber, parseString } from '../../helpers';

export type StepBase = {
  body: string;
  createdAt: number;
  id: string;
  title: string;
  updatedAt: number;
};

export function parseStepBase(record: Record<string, unknown>, index: number): StepBase {
  const now = Date.now();
  return {
    id: parseString(record['id'], `scenario-step-${index + 1}`),
    title: parseString(record['title']),
    body: parseBody(record),
    createdAt: parseNumber(record['createdAt'], now),
    updatedAt: parseNumber(record['updatedAt'], now),
  };
}

export function parseTone(value: unknown): ScenarioNoteTone {
  return value === 'info' || value === 'warning' || value === 'error' ? value : 'neutral';
}
