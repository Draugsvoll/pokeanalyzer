import { useState } from "react";
import { askGrok } from "../../utils/grok/grokClient";
import Button from "../button/Button";
import "./GrokTester.scss";

export default function GrokTester() {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  async function handleAskGrok() {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isLoading) return;

    setIsLoading(true);
    setError("");
    setResponse("");
    setHasCopied(false);

    const result = await askGrok(trimmedQuestion);

    if (!result.ok) {
      setError(result.error);
    } else {
      setResponse(result.text);
    }

    setIsLoading(false);
  }

  async function handleCopyResponse() {
    if (!response) return;

    await navigator.clipboard.writeText(response);
    setHasCopied(true);

    setTimeout(() => {
      setHasCopied(false);
    }, 1500);
  }

  return (
    <section className="grok-tester">
      <h1>Grok test</h1>

      <textarea
        className="grok-tester__textarea"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Ask Grok something..."
        rows={6}
      />

      <Button
        className="grok-tester__button"
        variant="primary"
        onClick={handleAskGrok}
        disabled={!question.trim() || isLoading}
      >
        {isLoading ? "Asking..." : "Ask Grok"}
      </Button>

      {error && <p className="grok-tester__error">{error}</p>}

      <div className="grok-tester__response">
        <div className="grok-tester__response-header">
          <h2>Response</h2>
          <Button
            className="grok-tester__copy-button"
            onClick={handleCopyResponse}
            disabled={!response}
          >
            {hasCopied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p>{response}</p>
      </div>
    </section>
  );
}
