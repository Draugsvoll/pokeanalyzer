import "./PsaEstimateResultView.scss";

type PsaEstimateResultViewProps = {
  error: string;
  result: string;
};

export default function PsaEstimateResultView({
  error,
  result,
}: PsaEstimateResultViewProps) {
  return (
    <div
      className="card-grader__result ui-render-fade"
      key={error ? "error" : result ? "result" : "empty"}
    >
      {error && <p className="card-grader__error">{error}</p>}

      {!error && !result && (
        <p className="card-grader__empty">
          Upload the front of a card to estimate its grade. A back photo is optional.
        </p>
      )}

      {result && <div className="card-grader__grok-result">{result}</div>}
    </div>
  );
}
