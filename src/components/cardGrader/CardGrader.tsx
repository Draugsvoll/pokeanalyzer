import React, { useMemo, useState } from "react";
import { ImageUp, LoaderCircle, ScanSearch } from "lucide-react";
import Button from "../button/Button";
import "./CardGrader.scss";

const API_URL = import.meta.env.VITE_API_URL;

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

export default function CardGrader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState<XimilarGradeResponse | null>(null);
  const [error, setError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [hasScannedSelectedFile, setHasScannedSelectedFile] = useState(false);

  const gradeRecord = result?.response?.records?.[0];
  const grades = gradeRecord?.grades;
  const scanDisabled = !selectedFile || isScanning || hasScannedSelectedFile;

  const scoreRows = useMemo(
    () => [
      ["Corners", grades?.corners],
      ["Edges", grades?.edges],
      ["Surface", grades?.surface],
      ["Centering", grades?.centering],
    ],
    [grades]
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : "");
    setResult(null);
    setError("");
    setHasScannedSelectedFile(false);
  };

  const handleScan = async () => {
    if (scanDisabled) return;

    setIsScanning(true);
    setHasScannedSelectedFile(true);
    setError("");
    setResult(null);

    try {
      const imageBase64 = await readFileAsDataUrl(selectedFile);
      const response = await fetch(`${API_URL}/api/card-grader/grade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageBase64 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Card grading request failed"
        );
      }

      setResult(data);
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
      <div className="card-grader__upload">
        <label className="card-grader__dropzone">
          {previewUrl ? (
            <img src={previewUrl} alt="Uploaded card preview" />
          ) : (
            <span>
              <ImageUp aria-hidden="true" />
              Upload card photo
            </span>
          )}
          <input accept="image/*" type="file" onChange={handleFileChange} />
        </label>

        <Button
          className="card-grader__button"
          disabled={scanDisabled}
          onClick={handleScan}
          variant="primary"
        >
          {isScanning ? (
            <>
              <LoaderCircle className="card-grader__spin" />
              Scanning...
            </>
          ) : (
            <>
              <ScanSearch />
              {hasScannedSelectedFile ? "Choose a new photo" : "Scan grade"}
            </>
          )}
        </Button>
      </div>

      <div className="card-grader__result">
        {error && <p className="card-grader__error">{error}</p>}

        {!error && !grades && (
          <p className="card-grader__empty">
            Upload a card photo to estimate its grade.
          </p>
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
