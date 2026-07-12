import "./AuthenticityResultView.scss";

type AuthenticityResultViewProps = {
  error: string;
  result: string;
};

export default function AuthenticityResultView({
  error,
  result,
}: AuthenticityResultViewProps) {
  return (
    <div className="card-grader__result authenticity-result">
      {error && <p className="card-grader__error">{error}</p>}
      {!error && !result && (
        <p className="card-grader__empty">
          Upload the front of a card to check its authenticity. A back photo is recommended.
        </p>
      )}
      {result && <div className="card-grader__grok-result">{result}</div>}
    </div>
  );
}
