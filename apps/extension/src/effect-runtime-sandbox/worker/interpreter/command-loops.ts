import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';

import { isRecord, n, type RenderState, withItem } from './model.js';

type Command<Op extends EffectV1Command['op']> = Extract<EffectV1Command, { op: Op }>;
type LoopCommand = Command<'forEach' | 'forGrid' | 'forRange' | 'stableOrderBy'>;
type ExecuteCommands = (commands: EffectV1Command[], state: RenderState) => Promise<void>;

export async function executeCommandLoop(
  command: LoopCommand,
  state: RenderState,
  executeCommands: ExecuteCommands
): Promise<void> {
  if (command.op === 'forEach') return executeItems(command, command.items, state, executeCommands);
  if (command.op === 'forRange') {
    const indexes = Array.from({ length: Number(command.count) }, (_, index) => index);
    return executeItems(command, indexes, state, executeCommands);
  }
  if (command.op === 'forGrid') return executeGrid(command, state, executeCommands);
  const decorated = command.items.map((item, index) => ({
    index,
    item,
    key: withItem(state, item, () => n(command.key, state)),
  }));
  decorated.sort((left, right) => {
    const order = left.key - right.key || left.index - right.index;
    return command.direction === 'desc' ? -order : order;
  });
  return executeItems(
    command,
    decorated.map(({ item }) => item),
    state,
    executeCommands
  );
}

async function executeGrid(
  command: Command<'forGrid'>,
  state: RenderState,
  executeCommands: ExecuteCommands
): Promise<void> {
  const items: Array<{ column: number; row: number }> = [];
  for (let row = 0; row < command.rows; row += 1) {
    for (let column = 0; column < command.columns; column += 1) items.push({ column, row });
  }
  await executeItems(command, items, state, executeCommands);
}

async function executeItems(
  command: LoopCommand,
  items: unknown[],
  state: RenderState,
  executeCommands: ExecuteCommands
): Promise<void> {
  const previousItem = state.scope.item;
  const previousVars = state.scope.vars;
  try {
    for (let index = 0; index < items.length; index += 1) {
      state.scope.item = items[index];
      const variable = resolveLoopVariable(command);
      state.scope.vars = { ...previousVars, [variable]: items[index], index };
      if (command.op === 'forGrid') setGridVariables(command, items[index], state);
      await executeCommands(command.commands, state);
    }
  } finally {
    state.scope.item = previousItem;
    state.scope.vars = previousVars;
  }
}

function resolveLoopVariable(command: LoopCommand): string {
  if (command.op === 'forEach' || command.op === 'stableOrderBy') {
    return command.itemVar ?? 'index';
  }
  return command.op === 'forRange' ? (command.indexVar ?? 'index') : 'index';
}

function setGridVariables(command: Command<'forGrid'>, item: unknown, state: RenderState): void {
  if (!isRecord(item)) return;
  state.scope.vars[command.rowVar ?? 'row'] = item['row'];
  state.scope.vars[command.columnVar ?? 'column'] = item['column'];
}
