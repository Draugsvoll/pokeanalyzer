type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g strokeLinecap="round" stroke="currentColor">
        <circle cx="16" cy="16" r="11.5" strokeWidth="2.2" />
        <path d="M4.5 16h8M19.5 16h8" strokeWidth="1.8" />
        <circle cx="16" cy="16" r="3.5" strokeWidth="1.8" />
      </g>
      <circle cx="16" cy="16" r="1.2" fill="var(--blue)" />
    </svg>
  );
}
