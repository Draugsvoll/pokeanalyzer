import "./CardIdentity.scss";

type CardIdentityProps = {
  className?: string;
  name: string;
  number?: string | null;
};

export function CardIdentity({
  className = "",
  name,
  number,
}: CardIdentityProps) {
  const classes = `app-card-identity${className ? ` ${className}` : ""}`;

  return (
    <span className={classes}>
      {number && (
        <>
          <span
            className="app-card-identity__number"
            title={`Card number ${number}`}
          >
            {number}
          </span>
          <span aria-hidden="true" className="app-card-identity__separator">
            ·
          </span>
        </>
      )}
      <span className="app-card-identity__name" title={name}>
        {name}
      </span>
    </span>
  );
}
