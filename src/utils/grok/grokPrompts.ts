import type { GrokImageContent, GrokMultimodalMessage } from "./grokPromptTypes";

const identifyCard: string =
`
Identify the exact pokemon card provided in the image. Return a valid JSON containing
these fields:

- pokemon name
- set name
- card number
- set series
`

const authenticityCheck: string =
`
You are a professional pokemon-card inspector. Verify if my pokemon card is real from image(s) provided. do a thorough analysis, take your time.
Your response must be in a valid json format as shown below.
dont subtract from the score because you cant do physical tests on it,
just make note a note of it in limitations. if user dont supply the back of the card,
explain how much that is shaving off the final score (inside the limitation field).
If the image is hard to read, dont just make assumptions. Note what was hard to scan,
what assumption you made and mention it in the response.

Use the format as shown in example response below:

{
  "authenticity": {
    "verdict": "Real",
    "confidence_percentage": 85,
    "confidence_level": "High",
    "summary": "This card appears to be a genuine Base Set Poliwrath holo. No major red flags were detected."
  },
  "analysis_breakdown": [
    {
      "category": "Holo Pattern",
      "score": 9,
      "status": "Real",
      "comment": "Starry background with colorful speckles matches authentic Base Set holo pattern."
    },
    {
      "category": "Color & Saturation",
      "score": 8,
      "status": "Real",
      "comment": "Good color depth on the blue background and yellow border."
    },
    {
      "category": "Print Quality",
      "score": 9,
      "status": "Real",
      "comment": "Text is sharp and clean with no blurring."
    },
    {
      "category": "Swirl Pattern",
      "score": 8,
      "status": "Real",
      "comment": "Spiral on the belly has the correct shape and placement."
    },
    {
      "category": "Edges & Borders",
      "score": 8,
      "status": "Real",
      "comment": "Clean yellow border with minimal whitening."
    },
    {
      "category": "PSA Slab",
      "score": 9,
      "status": "Likely Real",
      "comment": "Slab design and red label appear legitimate."
    }
  ],
  "strengths": [
    "Correct holo pattern",
    "Good print quality and color balance",
    "Card is professionally slabbed",
    "Strong overall eye appeal"
  ],
  "limitations": [
    "Back of the card not visible",
    "Cannot perform physical checks (weight, texture)",
    "No microscopic inspection possible"
  ],
  "recommendation": {
    "should_grade": false,
    "reason": "Already slabbed in what appears to be a legitimate PSA case.",
    "suggested_action": "No further action needed unless you want a second opinion on the grade."
  },
  "metadata": {
    "analyzed_at": "2026-07-08T13:49:00Z",
    "analysis_type": "Visual authenticity + condition check",
    "ai_confidence": 85,
    "notes": "Analysis based on front view only. Back of card would increase confidence."
  }
}

`

const psaGrading: string = `
Do a objective and honest PSA grading for the following card in a professional manner.
Take your time, be strict and honest. If its hard to read details on the image,
lean towards the conservative side of scoring. If something was hard to measure on the image,
mention it in the response and what assumptions you made. Give reasoning for every sub-score.
All the scores must align with your reasoning. Overall Score at top
`.trim();


const collectorsAnalysis: string =
`
You are a professional pokemon collector, and you are hired to rank cards for serious
collectors. you need to rank a card professionally. Take your time,
get as much data as possible, from as many trustworthy sources as possible.
give it a score from 1-100 where 100 would be the most desired card among collectors.
You must reasearch as deeply as possible before estimating the card,
because you often give a different score for the same card.

You must justify exactly WHY it was given its score. a collector should walk away
understanding exactly why it deserved that score and feeling more educated about the card.
The score should reflect your reasoning. The categories are as following.

Rarity & scarcity
Collectors Demand
Significance
Artwork & Aesthetics
Long-Term Collectibility

The output should now be in a summarized and fairly conscise format.

make the category long-term collectability less weighted than the others,
but don't mention that. give each category a score as well. all the scores are whole
numbers as a string. for example 43/100 is "43" the response should be your output into
a valid json, as formatted below. the overview field must be as concise and relevant to the
collector as possible, but it should only shortly explain the cards role as a collectable,
dont explain the score or pokemon-stats in this field. Avoid stating exact price numbers for the card.
The finalNote field should be a summarized conclusion of what made its final score, and how
collectors should approach it.

totalScore
overview
categories - each categori has fields: score, name, text
finalNote


Now rank this card:

`;



const isWorthGrading: string =
`
You are an expert Pokémon TCG collector and market analyst.
I will give you a specific Pokémon card. Your task is to analyze whether it is worth
getting PSA graded and provide a clear, collector-focused response.

Do the following:

1. Research the current market values (raw + PSA 8/9/10).
2. Research grading costs and realistic ROI.
3. Give a direct, honest recommendation.
Return a clean JSON object with exactly these keys:
- verdict: A short, direct conclusion (1 sentence)
- market_summary: An object containing raw value, PSA 8, PSA 9, PSA 10, and grading cost
- summary: A clear explanation of your reasoning
- action: A concise, actionable summary for the collector

Card to analyze:

`;

export function isWorthGradingPrompt(cardNameAndSet: string): string {
  const instructions = isWorthGrading
  .split("Card to analyze:")[0]
  .trimEnd();

  return `${instructions}\n\nCard to analyze:\n${cardNameAndSet}`;
}

export function collectorsAnalysisPrompt(cardNameAndSet: string): string {
  const instructions = collectorsAnalysis.split("Now rank this card:")[0].trimEnd();
  return `${instructions}\n\nNow rank this card:\n${cardNameAndSet}`;
}

export function identifyCardPrompt(
  frontImageBase64: string
): GrokMultimodalMessage {
  return {
    role: "user",
    content: [
      { type: "input_text", text: identifyCard.trim() },
      { type: "input_image", image_url: frontImageBase64 },
    ],
  };
}

export function PsaGradingPrompt(
  frontImageBase64: string,
  backImageBase64?: string
): GrokMultimodalMessage {
  const images: GrokImageContent[] = [
    { type: "input_image", image_url: frontImageBase64 },
  ];

  if (backImageBase64) {
    images.push({ type: "input_image", image_url: backImageBase64 });
  }

  return {
    role: "user",
    content: [
      { type: "input_text", text: psaGrading },
      images[0],
      ...images.slice(1),
    ],
  };
}

export function authenticityCheckPrompt(
  frontImageBase64: string,
  backImageBase64?: string
): GrokMultimodalMessage {
  const images: GrokImageContent[] = [
    { type: "input_image", image_url: frontImageBase64 },
  ];

  if (backImageBase64) {
    images.push({ type: "input_image", image_url: backImageBase64 });
  }

  return {
    role: "user",
    content: [
      { type: "input_text", text: authenticityCheck.trim() },
      images[0],
      ...images.slice(1),
    ],
  };
}
