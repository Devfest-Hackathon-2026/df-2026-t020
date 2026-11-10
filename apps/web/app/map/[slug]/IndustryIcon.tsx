// 業界のアイコン（industryLook.ts の線画）。飾りなので読み上げない。色は文字色（currentColor）

export default function IndustryIcon({
  icon,
  size,
  strokeWidth = 1.8,
  className,
}: {
  icon: string[];
  size: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** 見出しの右側にちらす、業界のアイコン（x・y・大きさは viewBox 0 0 400 200 の中、r は傾き） */
const SPRINKLES = [
  { x: 300, y: 36, s: 64, r: 10 },
  { x: 222, y: 100, s: 44, r: -12 },
  { x: 346, y: 116, s: 42, r: -4 },
  { x: 168, y: 42, s: 30, r: 16 },
  { x: 248, y: 40, s: 24, r: -22 },
  { x: 142, y: 122, s: 24, r: 8 },
  { x: 282, y: 140, s: 26, r: 24 },
  { x: 372, y: 4, s: 40, r: -16 },
] as const;

export function IconSprinkles({ icon, className }: { icon: string[]; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      {SPRINKLES.map(({ x, y, s, r }) => (
        <g
          key={`${x}-${y}`}
          transform={`translate(${x} ${y}) rotate(${r} ${s / 2} ${s / 2}) scale(${s / 24})`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon.map((d) => (
            <path key={d} d={d} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
    </svg>
  );
}
