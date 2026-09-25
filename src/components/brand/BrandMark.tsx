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
      <circle
        cx="16"
        cy="16"
        r="11.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M4.5 16h7.35M20.15 16H27.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
      <circle
        cx="16"
        cy="16"
        r="3.1"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="16" cy="16" fill="currentColor" r="1.05" />
    </svg>
  );
}
