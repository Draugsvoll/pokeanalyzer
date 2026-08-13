import "./LoadingState.scss";

type LoadingStateProps = {
  children: string;
  className?: string;
};

export function LoadingState({ children, className }: LoadingStateProps) {
  return (
    <div
      className={["loading-state", className].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="app-loading-spinner loading-state__spinner"
        aria-hidden="true"
      />
      <p className="loading-state__text">{children}</p>
    </div>
  );
}
