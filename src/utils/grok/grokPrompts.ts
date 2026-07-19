import type { GrokImageContent, GrokMultimodalMessage } from "./grokPromptTypes";

export const priceAnalysis: string =
`
If the data is available, please show todays market prices for the pokemon card i provided.

Only use sources outside of tcgplayer and cardmarket. Only use sources that are reliable.
If you can't find any reliable sources outside of tcgplayer and cardmarket, you leave it empty!

In market_data field, you can add different types of market price data, as long as its
relevant and valueable to the reader. Make sure the market_price field actually reflects the
current realistic price of today.

notes field should be concise and user-friendly to read. Its a summary.

Return as a valid JSON format, like the format example below. All fields are optional,
and shall only be filled if you have reliable data.

{
  "card": {
    "name": "Golem",
    "set": "EX Dragon",
    "number": "5/97",
    "rarity": "Holo Rare"
  },
  "market_data": [
    {
      "source": "source",
      "market_price": {
        "value": 42.21,
        "currency": "USD"
      },
      "lowest_listing": {
        "value": 12.24,
        "currency": "USD",
        "condition": "Unknown (likely lower than Near Mint)"
      },
      "most_recent_sale": {
        "value": 20.48,
        "currency": "USD"
      },
      "notes": "Current Market Price. Lowest listing appears to be a lower-condition copy rather than Near Mint.",
      "url": "https://www.tcgplayer.com/product/85826/pokemon-dragon-golem"
    },
    {
      "source": "source",
      "region": "EU",
      "near_mint_listing": {
        "value": 30.00,
        "currency": "EUR"
      },
      "excellent_listing": {
        "value": 32.00,
        "currency": "EUR",
        "condition": "EX"
      },
      "lowest_playable_listing": {
        "value": 9.99,
        "currency": "EUR",
        "condition": "GD"
      },
      "notes": "Multiple Near Mint sellers currently asking €30.00.",
      "url": "https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Dragon/Golem-DR5"
    },
    {
      "source": "PriceCharting",
      "recent_near_mint_sales": {
        "currency": "USD",
        "range": {
          "min": 35.00,
          "max": 47.50
        },
        "sales": [
          35.00,
          40.00,
          41.92,
          47.50,
          57.64
        ]
      },
      "notes": "Tracks completed sales rather than active listings. The $57.64 sale is considered a premium example.",
      "url": "https://www.pricecharting.com/game/pokemon-dragon/golem-5"
    },
    {
      "source": "PokeScope",
      "market_price": {
        "value": 42.21,
        "currency": "USD"
      },
      "notes": "Aggregates current market value using recent eBay sales and historical pricing.",
      "url": "https://pokescope.app/card/ex3-5/"
    }
  ],
  "last_updated": "2026-07-13",
  "currency_reference": {
    "primary": "USD",
    "secondary": "EUR"
  }
}
`

export function priceAnalysisPrompt(
  name: string,
  setName: string,
  number: string | number
): string {
  return `"name": ${JSON.stringify(name)},
          "set": ${JSON.stringify(setName)},
          "number": ${JSON.stringify(String(number))},

          ${priceAnalysis}`;
}

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

export const getBiggestMovers: string =
`
Summarize the biggest price movements in pokemon-cards for the last 7days.
1 section for biggest gainers, and 1 for biggest losers.

use this workflow:
-Scan TCGMetric for biggest movers.
-Verify the move using TCGplayer Market Price.

Return only a valid JSON format as in the example response below.

Get 5-10 cards for both biggest gainers and losers.

"notes" field should mention the price before and after, and try to explain what caused the price movement. If you dont have enough reliable data to explain why the price moved, then dont mention it.

{
  "report_title": "Pokémon TCG Price Movers",
  "period": "July 6 – July 13, 2026",
  "top_gainers": [
    {
      "rank": 1,
      "card": "Tyranitar V",
      "set": "Fusion Strike",
      "change": "+70–80%",
      "notes": "TCGPlayer market price rose from $0.99 to $4.01. The price move was caused by hype from the big event"
    },
  ],
  "top_losers": [
    {
      "rank": 1,
      "card": "Primarina GX",
      "set": "Sun & Moon",
      "change": "-75–85%",
      "notes": "TCGPlayer market price fell from $6.92 to $3.80 (-82%)."
    },
  ],
  "market_context": "The Pokémon TCG singles market showed notable volatility over
  the past ~30 days (mid-June to early July 2026), with strong gains concentrated
  in Illustration Rares from newer sets like Black Bolt and White Flare, while older
  GX/ex cards and certain trainers from Sun & Moon and other eras saw sharp declines.
  Data derived from TCGPlayer market prices tracked by DigitalTQ."
}
`

export const getGeneralNewsPrompt: string =
`
You are an expert Pokémon TCG collector community analyst.

Your task is to research and summarize the **latest trends** in the Pokémon TCG collector
community the last 7days. Use reliable sources.

Output **only valid JSON** in this exact structure:

{
  "overview": "1-2 sentence overview of the current state of the Pokémon TCG collector community.",
  "overall_sentiment": "One concise sentence about the current mood/sentiment in the community."
  "trends": [
    {
      "number": 1,
      "title": "Short Trend Title",
      "label": "new release",
      "context": "1-2 sentences giving context about this trend/news.",
      "points": [
        "Key point 1",
        "Key point 2"
      ]
    }
  ],
}

Instructions:
- you can create more key points if needed.
- Research and use the most recent Pokémon TCG news (focus on new sets, releases, promos, market trends, and collector activity).
- Choose accurate short labels (examples: "new release", "anniversary", "market", "promos", "retail", "accessories", "events").
- Keep "context" field to 1-2 informative sentences.
- Use engaging but professional tone.
- Do not include any explanations or text outside the JSON.
- Current date reference: July 2026.
`

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
