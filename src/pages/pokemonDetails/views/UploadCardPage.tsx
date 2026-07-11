import React, { useMemo, useState } from "react";
import { ImageUp, LoaderCircle, ScanSearch, X } from "lucide-react";
import Button from "../../../components/button/Button";
import "./UploadCardPage.scss";

const API_URL = import.meta.env.VITE_API_URL;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

type XimilarGradeRecord = {
  grades?: {
    final?: number;
    condition?: string;
    corners?: number;
    edges?: number;
    surface?: number;
    centering?: number;
  };
  _full_url_card?: string;
  _exact_url_card?: string;
  _status?: {
    text?: string;
  };
};

type XimilarGradeResponse = {
  status?: string;
  response?: {
    records?: XimilarGradeRecord[];
  };
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

export default function UploadCardPage() {
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState("");
  const [backPreviewUrl, setBackPreviewUrl] = useState("");
  const [result, setResult] = useState<XimilarGradeResponse | null>(null);
  const [grokResult, setGrokResult] = useState("");
  const [error, setError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [hasScannedSelectedFile, setHasScannedSelectedFile] = useState(false);
  const [draggingSide, setDraggingSide] = useState<"front" | "back" | null>(null);

  const gradeRecord = result?.response?.records?.[0];
  const grades = gradeRecord?.grades;
  const scanDisabled = !frontFile || isScanning || hasScannedSelectedFile;

  const scoreRows = useMemo(
    () => [
      ["Corners", grades?.corners],
      ["Edges", grades?.edges],
      ["Surface", grades?.surface],
      ["Centering", grades?.centering],
    ],
    [grades]
  );

  const selectImage = (side: "front" | "back", file: File | null) => {
    if (file && !file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }

    if (file && file.size > MAX_IMAGE_SIZE_BYTES) {
      setError("Each image must be 10MB or smaller");
      return;
    }

    const previewUrl = side === "front" ? frontPreviewUrl : backPreviewUrl;

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    if (side === "front") {
      setFrontFile(file);
      setFrontPreviewUrl(file ? URL.createObjectURL(file) : "");
    } else {
      setBackFile(file);
      setBackPreviewUrl(file ? URL.createObjectURL(file) : "");
    }
    setResult(null);
    setGrokResult("");
    setError("");
    setHasScannedSelectedFile(false);
  };

  const handleFileChange = (
    side: "front" | "back",
    event: React.ChangeEvent<HTMLInputElement>
  ) => selectImage(side, event.target.files?.[0] ?? null);

  const handleDrop = (
    side: "front" | "back",
    event: React.DragEvent<HTMLLabelElement>
  ) => {
    event.preventDefault();
    setDraggingSide(null);
    selectImage(side, event.dataTransfer.files?.[0] ?? null);
  };

  const clearImage = (side: "front" | "back") => {
    const previewUrl = side === "front" ? frontPreviewUrl : backPreviewUrl;

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    if (side === "front") {
      setFrontFile(null);
      setFrontPreviewUrl("");
    } else {
      setBackFile(null);
      setBackPreviewUrl("");
    }

    setResult(null);
    setGrokResult("");
    setError("");
    setHasScannedSelectedFile(false);
  };

  const handleScan = async () => {
    if (scanDisabled) return;

    setIsScanning(true);
    setHasScannedSelectedFile(true);
    setError("");
    setResult(null);
    setGrokResult("");

    try {
      const frontImageBase64 = await readFileAsDataUrl(frontFile);
      const backImageBase64 = backFile
        ? await readFileAsDataUrl(backFile)
        : undefined;
      const response = await fetch(`${API_URL}/grok/psa-grade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ frontImageBase64, backImageBase64 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Card grading request failed"
        );
      }

      setGrokResult(typeof data?.text === "string" ? data.text : "");
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Could not scan this card"
      );
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="card-grader">
      <header className="card-grader__header">
        <h1>Analyze Your Card</h1>
        <p>Get a PSA grade estimate and authenticity check</p>
      </header>
      <div className="card-grader__upload">
        <div className="card-grader__upload-grid">
          <div className="card-grader__upload-side">
            <div className="card-grader__side-heading"><strong>Front Side</strong><span className="card-grader__badge card-grader__badge--required">Required</span><small>High quality photo recommended</small></div>
            <label
              className={`card-grader__dropzone${draggingSide === "front" ? " card-grader__dropzone--dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDraggingSide("front"); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingSide(null); }}
              onDrop={(event) => handleDrop("front", event)}
            >
              {frontPreviewUrl ? (
                <img src={frontPreviewUrl} alt="Front of card preview" />
              ) : (
                <span className="card-grader__upload-prompt">
                  <span className="card-grader__upload-icon"><ImageUp aria-hidden="true" /></span>
                  <strong>Upload front</strong>
                  <small>PNG, JPG up to 10MB</small>
                  <em>Drag &amp; drop or click</em>
                </span>
              )}
              <input key={frontPreviewUrl} accept="image/*" type="file" onChange={(event) => handleFileChange("front", event)} />
            </label>
            {frontPreviewUrl && (
              <button aria-label="Clear front image" className="card-grader__clear" type="button" onClick={() => clearImage("front")}><X aria-hidden="true" /></button>
            )}
          </div>

          <div className="card-grader__upload-side">
            <div className="card-grader__side-heading"><strong>Back Side</strong><span className="card-grader__badge card-grader__badge--recommended">Recommended</span></div>
            <label
              className={`card-grader__dropzone${draggingSide === "back" ? " card-grader__dropzone--dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDraggingSide("back"); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingSide(null); }}
              onDrop={(event) => handleDrop("back", event)}
            >
              {backPreviewUrl ? (
                <img src={backPreviewUrl} alt="Back of card preview" />
              ) : (
                <span className="card-grader__upload-prompt">
                  <span className="card-grader__upload-icon"><ImageUp aria-hidden="true" /></span>
                  <strong>Upload back</strong>
                  <small>Optional but recommended</small>
                </span>
              )}
              <input key={backPreviewUrl} accept="image/*" type="file" onChange={(event) => handleFileChange("back", event)} />
            </label>
            {backPreviewUrl && (
              <button aria-label="Clear back image" className="card-grader__clear" type="button" onClick={() => clearImage("back")}><X aria-hidden="true" /></button>
            )}
          </div>
        </div>

        <div className="card-grader__btn-row">
          <Button className="card-grader__estimate-button" disabled={scanDisabled} onClick={handleScan}>
            {isScanning ? <LoaderCircle className="card-grader__spin" /> : <ScanSearch />}
            {isScanning ? "Analyzing..." : "Get PSA Estimate"}
          </Button>
          <Button className="card-grader__auth-button" disabled={!frontFile}><ScanSearch />Check Authenticity</Button>
        </div>

      </div>

      <div className="card-grader__result">
        {error && <p className="card-grader__error">{error}</p>}

        {!error && !grades && !grokResult && (
          <p className="card-grader__empty">
            Upload the front of a card to estimate its grade. A back photo is optional.
          </p>
        )}

        {grokResult && (
          <div className="card-grader__grok-result">{grokResult}</div>
        )}

        {grades && (
          <>
            <div className="card-grader__summary">
              <div>
                <span>Estimated grade</span>
                <strong>{grades.final ?? "N/A"}</strong>
              </div>
              <div>
                <span>Condition</span>
                <strong>{grades.condition ?? "N/A"}</strong>
              </div>
            </div>

            <div className="card-grader__scores">
              {scoreRows.map(([label, value]) => (
                <div className="card-grader__score" key={label}>
                  <b>{label}</b>
                  <span>{value ?? "N/A"}</span>
                </div>
              ))}
            </div>

            {(gradeRecord?._full_url_card || gradeRecord?._exact_url_card) && (
              <div className="card-grader__images">
                {gradeRecord._full_url_card && (
                  <img src={gradeRecord._full_url_card} alt="Annotated card" />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
