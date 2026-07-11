const XIMILAR_REQUEST_URL = "https://api.ximilar.com/account/v2/request/";
const POLL_DELAY_MS = 1500;
const MAX_POLL_ATTEMPTS = 25;

type XimilarRequestResponse = {
  id?: string;
  status?: string;
  response?: unknown;
  detail?: string;
  message?: string;
};

export class XimilarCardGraderError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "XimilarCardGraderError";
    this.statusCode = statusCode;
  }
}

function getXimilarApiKey() {
  const apiKey = process.env.XIMILAR_API_KEY;

  if (!apiKey) {
    throw new XimilarCardGraderError("Card grader is not configured", 500);
  }

  return apiKey.replace(/^(Token|Bearer)\s+/i, "").trim();
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readXimilarJson(response: Response) {
  const data = (await response.json()) as XimilarRequestResponse;

  if (!response.ok) {
    console.error(
      `Ximilar card grader request failed with status ${response.status} ${response.statusText}`
    );
    throw new XimilarCardGraderError("Card grading request failed", 502);
  }

  return data;
}

export async function gradeCardImage(imageBase64: string | string[]) {
  const apiKey = getXimilarApiKey();
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];

  const submitResponse = await fetch(XIMILAR_REQUEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "card-grader",
      endpoint: "grade",
      records: images.map((_base64) => ({ _base64 })),
    }),
  });

  const submitted = await readXimilarJson(submitResponse);

  if (!submitted.id) {
    throw new XimilarCardGraderError("Card grading request failed", 502);
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await wait(POLL_DELAY_MS);

    const pollResponse = await fetch(`${XIMILAR_REQUEST_URL}${submitted.id}`, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    const polled = await readXimilarJson(pollResponse);

    if (polled.status === "DONE") {
      return polled;
    }

    if (polled.status === "FAILED" || polled.status === "ERROR") {
      throw new XimilarCardGraderError("Card grading failed", 502);
    }
  }

  throw new XimilarCardGraderError("Card grading timed out", 504);
}
