import { useEffect, useState } from "react";
import Button from "../../components/button/Button";
import { useAuth } from "../../context/authContextValue";
import { askGrok } from "../../utils/grok/grokClient";
import {
  getBiggestMovers,
  getGeneralNewsPrompt,
} from "../../utils/grok/grokPrompts";
import "./Admin.scss";
import { Navigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [generatingNews, setGeneratingNews] = useState(false);
  const [generatedNews, setGeneratedNews] = useState("");
  const [newsMessage, setNewsMessage] = useState("");
  const [newsError, setNewsError] = useState("");
  const [generatingMovers, setGeneratingMovers] = useState(false);
  const [generatedMovers, setGeneratedMovers] = useState("");
  const [moversMessage, setMoversMessage] = useState("");
  const [moversError, setMoversError] = useState("");

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        setCheckingAdmin(false);
        return;
      }

      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_URL}/api/admin/check`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setIsAdmin(res.ok);
      } catch {
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    };

    checkAdminStatus();
  }, [user]);

  const generateNews = async () => {
    if (generatingNews) return;

    setGeneratingNews(true);
    setGeneratedNews("");
    setNewsMessage("");
    setNewsError("");

    const result = await askGrok(getGeneralNewsPrompt, "market_news");

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
      setNewsError("Could not copy the JSON. Select the text and copy it manually.");
    }
  };

  const generateMovers = async () => {
    if (generatingMovers) return;

    setGeneratingMovers(true);
    setGeneratedMovers("");
    setMoversMessage("");
    setMoversError("");

    const result = await askGrok(getBiggestMovers, "market_news");

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

      <section className="admin-page__tool" aria-labelledby="general-news-tool">
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

      <section className="admin-page__tool" aria-labelledby="movers-tool">
        <div>
          <h2 id="movers-tool">Biggest movers</h2>
          <p>Generate the biggest weekly movers shown on the homepage.</p>
        </div>
        <Button disabled={generatingMovers} onClick={generateMovers}>
          {generatingMovers ? "Generating..." : "Get biggest movers"}
        </Button>
      </section>

      {moversMessage && (
        <p className="admin-page__message" role="status">
          {moversMessage}
        </p>
      )}
      {moversError && (
        <p className="admin-page__error" role="alert">
          {moversError}
        </p>
      )}

      {generatedMovers && (
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
