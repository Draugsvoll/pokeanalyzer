import { type FormEvent, useState } from "react";
import Button from "../button/Button";
import "./OpenaiTesteer.scss";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type OpenAiTestResponse = {
  text?: string;
  error?: string;
};

export default function OpenaiTesteer() {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  async function handleAskOpenAi(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isLoading) return;

    setIsLoading(true);
    setError("");
    setResponse("");
    setHasCopied(false);

    try {
      const params = new URLSearchParams({ q: trimmedQuestion });
      const res = await fetch(`${API_URL}/openai/test?${params.toString()}`);
      const data = (await res.json()) as OpenAiTestResponse;

      if (!res.ok) {
        setError(data.error ?? "OpenAI request failed");
        return;
      }

      setResponse(data.text ?? "");
    } catch (err) {
      console.error("OpenAI test request failed:", err);
      setError("Could not reach the OpenAI test endpoint");
    } finally {
      setIsLoading(false);
    }
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
    <section className="openai-testeer">
      <h1>OpenAI test</h1>

      <form className="openai-testeer__form" onSubmit={handleAskOpenAi}>
        <textarea
          className="openai-testeer__textarea"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask OpenAI something..."
          rows={6}
        />

        <Button
          className="openai-testeer__button"
          variant="primary"
          type="submit"
          disabled={!question.trim() || isLoading}
        >
          {isLoading ? "Asking..." : "Submit"}
        </Button>
      </form>

      {error && <p className="openai-testeer__error">{error}</p>}

      <div className="openai-testeer__response">
        <div className="openai-testeer__response-header">
          <h2>Response</h2>
          <Button
            className="openai-testeer__copy-button"
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
