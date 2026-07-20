export const SCENARIO_AI_OPERATION_EXAMPLES = [
  {
    operations: [
      { slideId: 'slide-1', title: 'Updated title', type: 'setSlideTitle' },
      { notes: 'Speaker notes', slideId: 'slide-1', type: 'setSlideNotes' },
    ],
  },
  {
    operations: [
      {
        element: {
          frame: { height: 160, width: 360, x: 760, y: 160 },
          kind: 'callout',
          text: 'Explain the important interaction',
        },
        slideId: 'slide-1',
        type: 'addElement',
      },
    ],
  },
] as const;
