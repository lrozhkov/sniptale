export function VerticalTextAlignIcon(props: { position: 'top' | 'middle' | 'bottom' }) {
  const lineY =
    props.position === 'top'
      ? [6, 10, 14]
      : props.position === 'middle'
        ? [10, 14, 18]
        : [14, 18, 22];
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[15px] w-[15px]">
      <rect
        x="5"
        y="4"
        width="14"
        height="16"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        opacity="0.45"
      />
      {lineY.map((y, index) => (
        <path
          key={y}
          d={`M ${index === 1 ? 8 : 7} ${y} H ${index === 1 ? 16 : 17}`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.9"
        />
      ))}
    </svg>
  );
}
