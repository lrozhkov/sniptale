import type {
  QuickAction,
  QuickActionsDisplayMode,
  ViewportPreset,
} from '../../../../contracts/settings';
import { QuickActionListItem, type QuickActionListDensity } from './block-items/item';

const MAX_STRETCHED_QUICK_ACTIONS = 10;

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function getQuickActionListDensity(actionsCount: number): QuickActionListDensity {
  if (actionsCount <= 3) {
    return 'regular';
  }

  if (actionsCount <= 5) {
    return 'compact';
  }

  if (actionsCount <= 6) {
    return 'dense';
  }

  return 'tight';
}

function getQuickActionListSpacingClass(actionsCount: number) {
  if (actionsCount <= 3) {
    return 'space-y-2';
  }

  if (actionsCount <= 5) {
    return 'space-y-1.5';
  }

  if (actionsCount <= 6) {
    return 'space-y-1';
  }

  return 'space-y-px';
}

function getQuickActionListGapClass(actionsCount: number) {
  if (actionsCount <= 3) {
    return 'gap-2';
  }

  if (actionsCount <= 5) {
    return 'gap-1.5';
  }

  if (actionsCount <= 6) {
    return 'gap-1';
  }

  return 'gap-px';
}

function shouldStretchQuickActionList(actionsCount: number) {
  return actionsCount >= 4 && actionsCount <= MAX_STRETCHED_QUICK_ACTIONS;
}

export function QuickActionsBlock({
  actions,
  displayMode,
  presets,
  disabledTitle,
  onTriggerAction,
}: {
  actions: QuickAction[];
  displayMode: QuickActionsDisplayMode;
  presets: ViewportPreset[];
  disabledTitle?: string | null;
  onTriggerAction: (actionId: string) => void;
}) {
  if (displayMode === 'hidden' || actions.length === 0) {
    return null;
  }

  const density = getQuickActionListDensity(actions.length);
  const shouldStretch = shouldStretchQuickActionList(actions.length);
  const listClassName = shouldStretch
    ? cx('grid h-full min-h-0 w-full grid-cols-1', getQuickActionListGapClass(actions.length))
    : cx('w-full', getQuickActionListSpacingClass(actions.length));
  const listStyle = shouldStretch
    ? {
        gridTemplateRows: `repeat(${actions.length}, minmax(0, 1fr))`,
      }
    : undefined;

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className={listClassName} style={listStyle}>
        {actions.map((action) => (
          <QuickActionListItem
            key={action.id}
            action={action}
            presets={presets}
            density={density}
            onTriggerAction={onTriggerAction}
            {...(disabledTitle === undefined ? {} : { disabledTitle })}
          />
        ))}
      </div>
    </div>
  );
}
