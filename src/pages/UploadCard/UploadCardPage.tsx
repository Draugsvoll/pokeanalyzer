import React, { useState } from "react";
import { ImageUp, LoaderCircle, ScanSearch, X } from "lucide-react";
import Button from "../../components/button/Button";
import AuthenticityResultView from "./views/AuthenticityResultView";
import PsaEstimateResultView from "./views/PsaEstimateResultView";
import "./UploadCardPage.scss";
import { authenticatedFetch } from "../../utils/authenticatedFetch";
import {
  isAbortError,
  useAbortableRequest,
} from "../../hooks/useAbortableRequest";

const API_URL = import.meta.env.VITE_API_URL;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

type AnalysisType = "psa" | "authenticity";
type CardSide = "front" | "back";

type CardImage = {
  file: File | null;
  previewUrl: string;
};

const uploadOptions = [
  {
    side: "front",
    heading: "Front Side",
    badge: "Required",
    badgeClassName: "card-grader__badge--required",
    prompt: "Upload front",
    promptNote: "PNG, JPG up to 10MB",
    showDropHint: true,
  },
  {
    side: "back",
    heading: "Back Side",
    badge: "Recommended",
    badgeClassName: "card-grader__badge--recommended",
    prompt: "Upload back",
    promptNote: "Optional but recommended",
    showDropHint: false,
  },
] satisfies ReadonlyArray<{
  side: CardSide;
  heading: string;
  badge: string;
  badgeClassName: string;
  prompt: string;
  promptNote: string;
  showDropHint: boolean;
}>;

const analysisOptions = [
  {
    type: "psa",
    endpoint: "/grok/psa-grade",
    label: "Get PSA Estimate",
    loadingLabel: "Analyzing...",
    includeBackImage: true,
    ResultView: PsaEstimateResultView,
  },
  {
    type: "authenticity",
    endpoint: "/grok/authenticity-check",
    label: "Check Authenticity",
    loadingLabel: "Checking...",
    includeBackImage: true,
    ResultView: AuthenticityResultView,
  },
] satisfies ReadonlyArray<{
  type: AnalysisType;
  endpoint: string;
  label: string;
  loadingLabel: string;
  includeBackImage: boolean;
  ResultView: React.ComponentType<{ error: string; result: string }>;
}>;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

export default function UploadCardPage() {
  const [cardImages, setCardImages] = useState<Record<CardSide, CardImage>>({
    front: { file: null, previewUrl: "" },
    back: { file: null, previewUrl: "" },
  });
  const [result, setResult] = useState("");
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisType>("psa");
  const [error, setError] = useState("");
  const [activeRequest, setActiveRequest] = useState<AnalysisType | null>(null);
  const [draggingSide, setDraggingSide] = useState<CardSide | null>(null);
  const { abortActiveRequest, startRequest } = useAbortableRequest();

  const actionDisabled = !cardImages.front.file || activeRequest !== null;

  const resetResults = () => {
    setResult("");
    setError("");
  };

  const selectImage = (side: CardSide, file: File | null) => {
    abortActiveRequest();
    if (file && !file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }

    if (file && file.size > MAX_IMAGE_SIZE_BYTES) {
      setError("Each image must be 10MB or smaller");
      return;
    }

    const previewUrl = cardImages[side].previewUrl;
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setCardImages((current) => ({
      ...current,
      [side]: {
        file,
        previewUrl: file ? URL.createObjectURL(file) : "",
      },
    }));
    resetResults();
  };

  const handleFileChange = (
    side: CardSide,
    event: React.ChangeEvent<HTMLInputElement>
  ) => selectImage(side, event.target.files?.[0] ?? null);

  const handleDrop = (
    side: CardSide,
    event: React.DragEvent<HTMLLabelElement>
  ) => {
    event.preventDefault();
    setDraggingSide(null);
    selectImage(side, event.dataTransfer.files?.[0] ?? null);
  };

  const clearImage = (side: CardSide) => selectImage(side, null);

  const runAnalysis = async (option: (typeof analysisOptions)[number]) => {
    const { endpoint, includeBackImage, type } = option;
    const frontFile = cardImages.front.file;
    if (!frontFile || activeRequest !== null) return;

    setActiveRequest(type);
    setSelectedAnalysis(type);
    setError("");
    setResult("");

    try {
      const signal = startRequest();
      const frontImageBase64 = await readFileAsDataUrl(frontFile);
      const backImageBase64 = includeBackImage && cardImages.back.file
        ? await readFileAsDataUrl(cardImages.back.file)
        : undefined;
      const response = await authenticatedFetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          frontImageBase64,
          backImageBase64,
        }),
        signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Card grading request failed"
        );
      }

      // API usually returns a string; if the model/path already gave an object, keep it usable.
      let text = "";
      if (typeof data?.text === "string") {
        text = data.text;
      } else if (data?.text != null && typeof data.text === "object") {
        console.warn("[UploadCard] response.text was an object; stringifying for ResultView", data.text);
        text = JSON.stringify(data.text);
      } else if (data?.text != null) {
        console.warn("[UploadCard] unexpected response.text type", typeof data.text, data.text);
        text = String(data.text);
      }

      setResult(text);
    } catch (scanError) {
      if (isAbortError(scanError)) return;
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Could not analyze this card"
      );
    } finally {
      setActiveRequest(null);
    }
  };

  return (
    <div className="card-grader">
      <header className="card-grader__header">
        <h1>Analyze Your Card</h1>
        <p>Get an estimated PSA Grade or Authenticity score</p>
      </header>
      <div className="card-grader__upload">
        <div className="card-grader__upload-grid">
          {uploadOptions.map((option) => {
            const image = cardImages[option.side];

            return (
              <div className="card-grader__upload-side" key={option.side}>
                <div className="card-grader__side-heading">
                  <strong>{option.heading}</strong>
                  <span className={`card-grader__badge ${option.badgeClassName}`}>{option.badge}</span>
                </div>
                <label
                  className={`card-grader__dropzone${draggingSide === option.side ? " card-grader__dropzone--dragging" : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); setDraggingSide(option.side); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingSide(null); }}
                  onDrop={(event) => handleDrop(option.side, event)}
                >
                  {image.previewUrl ? (
                    <img src={image.previewUrl} alt={`${option.heading} of card preview`} />
                  ) : (
                    <span className="card-grader__upload-prompt">
                      <span className="card-grader__upload-icon"><ImageUp aria-hidden="true" /></span>
                      <strong>{option.prompt}</strong>
                      <small>{option.promptNote}</small>
                      {option.showDropHint && <em>Drag &amp; drop or click</em>}
                    </span>
                  )}
                  <input key={image.previewUrl} accept="image/*" type="file" onChange={(event) => handleFileChange(option.side, event)} />
                </label>
                {image.previewUrl && (
                  <button aria-label={`Clear ${option.side} image`} className="card-grader__clear" type="button" onClick={() => clearImage(option.side)}><X aria-hidden="true" /></button>
                )}
              </div>
            );
          })}
        </div>

        <div className="card-grader__btn-row">
          {analysisOptions.map((option) => {
            const isLoading = activeRequest === option.type;

            return (
              <Button
                key={option.type}
                variant="primary"
                fullWidth
                disabled={actionDisabled}
                onClick={() => runAnalysis(option)}
              >
                {isLoading ? <LoaderCircle className="card-grader__spin" /> : <ScanSearch />}
                {isLoading ? option.loadingLabel : option.label}
              </Button>
            );
          })}
        </div>

      </div>

      {analysisOptions.map(({ type, ResultView }) =>
        selectedAnalysis === type ? (
          <ResultView key={type} error={error} result={result} />
        ) : null
      )}

    </div>
  );
}
