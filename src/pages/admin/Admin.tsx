import { useEffect, useState } from "react";
import { NEWS_FEATURES } from "../../../shared/newsFeatures";
import Button from "../../components/button/Button";
import { useAuth } from "../../context/authContextValue";
import { askGrok } from "../../utils/grok/grokClient";
import {
  biggestMoversInput,
  biggestMoversInstructions,
  generalNewsInput,
  generalNewsInstructions,
} from "../../utils/grok/grokPrompts";
import "./Admin.scss";
import { Navigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const [adminCheck, setAdminCheck] = useState<{
    status: "checking" | "allowed" | "denied";
    uid: string | null;
  }>({ status: "checking", uid: null });
  const [generatingNews, setGeneratingNews] = useState(false);
  const [generatedNews, setGeneratedNews] = useState("");
  const [newsMessage, setNewsMessage] = useState("");
  const [newsError, setNewsError] = useState("");
  const [generatingMovers, setGeneratingMovers] = useState(false);
  const [generatedMovers, setGeneratedMovers] = useState("");
  const [moversMessage, setMoversMessage] = useState("");
  const [moversError, setMoversError] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;

    const checkedUid = user.uid;
    const controller = new AbortController();

    const checkAdminStatus = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_URL}/api/admin/check`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setAdminCheck({
            status: res.ok ? "allowed" : "denied",
            uid: checkedUid,
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setAdminCheck({ status: "denied", uid: checkedUid });
        }
      }
    };

    void checkAdminStatus();
    return () => controller.abort();
  }, [authLoading, user]);

  const adminCheckMatchesUser = Boolean(user) && adminCheck.uid === user?.uid;
  const checkingAdmin =
    Boolean(user) &&
    (!adminCheckMatchesUser || adminCheck.status === "checking");
  const isAdmin = adminCheckMatchesUser && adminCheck.status === "allowed";

  const generateNews = async () => {
    if (generatingNews) return;

    setGeneratingNews(true);
    setGeneratedNews("");
    setNewsMessage("");
    setNewsError("");

    const result = await askGrok("market_news", {
      userInput: generalNewsInput,
      instructions: generalNewsInstructions,
    });

    if (!result.ok) {
      setNewsError(result.error);
    } else {
      setGeneratedNews(result.text);
      setNewsMessage("Latest news generated successfully.");
    }

    setGeneratingNews(false);
  };

  const copyNews = async () => {
    try {
      await navigator.clipboard.writeText(generatedNews);
      setNewsError("");
      setNewsMessage("JSON copied to clipboard.");
    } catch {
      setNewsMessage("");
      setNewsError(
        "Could not copy the JSON. Select the text and copy it manually.",
      );
    }
  };

  const generateMovers = async () => {
    if (generatingMovers) return;

    setGeneratingMovers(true);
    setGeneratedMovers("");
    setMoversMessage("");
    setMoversError("");

    const result = await askGrok("market_news", {
      userInput: biggestMoversInput,
      instructions: biggestMoversInstructions,
    });

    if (!result.ok) {
      setMoversError(result.error);
    } else {
      setGeneratedMovers(result.text);
      setMoversMessage("Biggest movers generated successfully.");
    }

    setGeneratingMovers(false);
  };

  const copyMovers = async () => {
    try {
      await navigator.clipboard.writeText(generatedMovers);
      setMoversError("");
      setMoversMessage("JSON copied to clipboard.");
    } catch {
      setMoversMessage("");
      setMoversError(
        "Could not copy the JSON. Select the text and copy it manually.",
      );
    }
  };

  if (authLoading) {
    return (
      <main className="admin-page admin-page--status">
        <h1>Loading…</h1>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (checkingAdmin) {
    return (
      <main className="admin-page admin-page--status">
        <h1>Checking permissions…</h1>
      </main>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <p className="admin-page__eyebrow">Admin</p>
        <h1>Dashboard</h1>
        <p className="admin-page__lead">
          Admin tools for managing market news and site content.
        </p>
      </header>

      <section
        className="admin-page__tool default-container"
        aria-labelledby="general-news-tool"
      >
        <div>
          <h2 id="general-news-tool">Latest news</h2>
          <p>Generate the latest market-news content shown on the homepage.</p>
        </div>
        <Button disabled={generatingNews} onClick={generateNews}>
          {generatingNews ? "Generating..." : "Generate news"}
        </Button>
      </section>

      {newsMessage && (
        <p className="admin-page__message" role="status">
          {newsMessage}
        </p>
      )}
      {newsError && (
        <p className="admin-page__error" role="alert">
          {newsError}
        </p>
      )}

      {generatedNews && (
        <section
          className="admin-page__output"
          aria-labelledby="generated-news-heading"
        >
          <header className="admin-page__output-header">
            <h2 id="generated-news-heading">Latest news JSON</h2>
            <Button onClick={copyNews}>Copy JSON</Button>
          </header>
          <pre>
            <code>{generatedNews}</code>
          </pre>
        </section>
      )}

      {NEWS_FEATURES.biggestMovers && (
        <section
          className="admin-page__tool default-container"
          aria-labelledby="movers-tool"
        >
          <div>
            <h2 id="movers-tool">Biggest movers</h2>
            <p>Generate the biggest weekly movers shown on the homepage.</p>
          </div>
          <Button disabled={generatingMovers} onClick={generateMovers}>
            {generatingMovers ? "Generating..." : "Get biggest movers"}
          </Button>
        </section>
      )}

      {NEWS_FEATURES.biggestMovers && moversMessage && (
        <p className="admin-page__message" role="status">
          {moversMessage}
        </p>
      )}
      {NEWS_FEATURES.biggestMovers && moversError && (
        <p className="admin-page__error" role="alert">
          {moversError}
        </p>
      )}

      {NEWS_FEATURES.biggestMovers && generatedMovers && (
        <section
          className="admin-page__output"
          aria-labelledby="generated-movers-heading"
        >
          <header className="admin-page__output-header">
            <h2 id="generated-movers-heading">Biggest movers JSON</h2>
            <Button onClick={copyMovers}>Copy JSON</Button>
          </header>
          <pre>
            <code>{generatedMovers}</code>
          </pre>
        </section>
      )}
    </main>
  );
}
