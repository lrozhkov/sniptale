import { expect, it, vi } from 'vitest';
const list = vi.hoisted(() => vi.fn());
vi.mock('../../projects', () => ({ listScenarioProjects: list }));
import { listScenarioStepTemplates } from './templates';

it('lists templates separately including recoverable invalid entries, preserving source ordering', async () => {
  const template = { id: 'template', purpose: 'step-template', availability: 'available' };
  const broken = { id: 'broken', purpose: 'step-template', availability: 'invalid' };
  list.mockResolvedValue([{ id: 'guide', availability: 'available' }, template, broken]);
  await expect(listScenarioStepTemplates()).resolves.toEqual([template, broken]);
});

it('propagates catalog unavailability instead of presenting an empty catalog', async () => {
  list.mockRejectedValue(new Error('Unavailable'));
  await expect(listScenarioStepTemplates()).rejects.toThrow('Unavailable');
});
