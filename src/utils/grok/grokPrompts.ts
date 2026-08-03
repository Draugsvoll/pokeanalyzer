import type { GrokImageContent, GrokMultimodalMessage } from "./grokPromptTypes";

export const priceAnalysis: string =
`
If the data is available, please show todays market prices for the pokemon card i provided.

Only use sources outside of tcgplayer and cardmarket. Only use sources that are reliable.
Make sure to include the source "PriceCharting" if it has available data.
When using PriceCharting, make sure to include the most recent sales data for the card, and include the range of prices for the most recent sales, if it's available.
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

const salesData: string = `
Can you fetch sold data based on grading for this card at PriceCharting website?

Response must be only a valid JSON format. No extra text before or after the JSON format.
Response must be put into the exact structure as the example response below.
If data not available just leave the field empty.

Notes field is optional. If theres a need to clarify which variant is used, then do it. You can add
other important information that is not alreay obvious.


{
  "title": "Blaine's Charizard #2",
  "subtitle": "Gym Challenge • Unlimited • Rare Holo • PriceCharting Data",
  "market_prices": [
    {
      "grade": "Ungraded",
      "price": "$272.83",
      "volume": "~1 sale / week"
    },
    {
      "grade": "Grade 7",
      "price": "$568.23",
      "volume": "~2 sales / week"
    },
    {
      "grade": "Grade 8",
      "price": "$830.00",
      "volume": "~3 sales / week"
    },
    {
      "grade": "Grade 9",
      "price": "$1,173.92",
      "volume": "~3 sales / week"
    },
    {
      "grade": "Grade 9.5",
      "price": "$1,290.02",
      "volume": "~6 sales / year"
    },
    {
      "grade": "PSA 10",
      "price": "$6,000.25",
      "volume": "~1 sale / month"
    }
  ],
  "notes": [
    "This is the Unlimited version (no 1st Edition stamp). 1st Edition is significantly more expensive.",
    "Prices fluctuate with condition, centering, and whether the card has a strong holo swirl."
  ]
}


`

const sellMyCard: string = `
  How much should I sell this card for? Give a summarized response as valid JSON.
  No extra text before or after the JSON. The root must be an object with a "steps" array.
  Each step must contain a "title" and a "substeps" array.

  The first category must be price recommendations,
  include different conditions/grading.

  Don't make a step about inspecting condition.

  The second category lets me know the general sales volume of this card and what sources everything is based on.
  Use reliable sources and make sure we know roughly how often it sells. For example per week, month, or year.
  Use one substep per grading category.

  Third category: How fast can I realistically expect to sell this card? Consider different markets and conditions.

  Fourth category: I need to know different marketplaces available and what each one is best for.

  Other category (optional): Include any other valuable, applicable information.

  Don't blend different categories together. Name each step based on its content.

  Example response:

  {
    "steps": [
      {
        "title": "Price Recommendations",
        "substeps": [
          {
            "label": "PSA 9",
            "price": "$100-$150"
          },
          {
            "label": "PSA 8",
            "price": "$200-$250"
          }
        ]
      },
      {
        "title": "Sales Volume and Sources",
        "substeps": [
          "",
          "",
          ""
        ]
      },
      {
        "title": "Expected Sales Time",
        "substeps": [
          "",
          ""
          ""
        ]
      },
      {
        "title": "",
        "substeps": [
          "",
          ""
        ]
      }
    ]
  }

`;

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
If the image is hard to read, dont just make assumptions. Note what was hard to scan and
what assumption you made, and mention it in the response.

Use the format as shown in example response below. Your entire response shall only be the valid JSON object.
No extra text before or after.

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
Do a PSA grading of this pokemon card. Be as strict and thorough as a professional grader.
Be objective about the card. If the image has limitations where its hard to determine condition
on a detail, assume its closer to an average condition. Also mention everything about the image
that limits your grading process. Scan the image as detailed as possible so no details gets lost
in the process. Don't invent anything about the condition.

Give a roughly estimated score for each category: Centering, Corners, Edges, Surface.

Give a summarized report (Don't mention you did something because that's what i told you).
It should be a user friendly report to read.

Your response should be ONLY a valid JSON format — no markdown fences, no commentary
before or after.

Use exactly this structure example (field names and nesting must match):

{
  "overall": {
    "grade": 7,
    "condition_label": "Near Mint"
  },
  "condition_report": [
    {
      "category": "Centering",
      "score": 8,
      "comment": "Left/right and top/bottom borders are reasonably balanced on the front. The yellow border shows no extreme leftover or tight cuts. It appears roughly in the 55/45 to 60/40 range (acceptable for higher grades but not perfect 50/50 or better). No measurable tilt or diamond cut visible in the photo."
    },
    {
      "category": "Corners",
      "score": 7,
      "comment": "All four corners retain good overall shape with no major fraying, folds, or large chips. Under close inspection of the image, the tips show mild softening/rounding rather than razor sharpness, with possible tiny whitening beginning to appear (especially noticeable on the lower corners against the yellow border). No crushed or peeled corners."
    },
    {
      "category": "Edges",
      "score": 7,
      "comment": "Edges are mostly clean and straight. Minor edge wear and slight whitening are visible in places along the yellow border (particularly left and bottom edges), consistent with light handling. No deep nicks, paper loss, or rough cuts stand out. The black inner border around the artwork box looks intact."
    },
    {
      "category": "Surface",
      "score": 7,
      "comment": "The holofoil pattern in the artwork window displays solid shine and the classic Base Set sparkle without large scratches, scuffs, or clouding immediately obvious. The non-holo areas appear clean with readable text, solid ink, and no major print defects, stains, or creases. Minor surface haze or factory print texture may be present but is hard to fully separate from photo artifacts."
    }
  ],
  "summary": "This Venusaur presents as a solid Near Mint example with attractive eye appeal for a Base Set holo. It shows light, honest handling wear primarily in the form of mild corner softening and edge whitening rather than damage. The holo remains bright and the card is free of creases, heavy scratches, stains, or structural issues. Centering is good without being exceptional. It does not reach Gem Mint (PSA 10) or Mint (PSA 9) standards due to the visible corner/edge wear and lack of pristine surface/corner sharpness. It sits comfortably above Excellent-Mint territory.",
  "image_limitations": [
    "Single front-only photo (back condition completely unknown — back centering, whitening, scratches, or stamps cannot be evaluated).",
    "Resolution and compression limit detection of fine surface scratches, hairlines, print lines, or micro-wear on the holo and borders.",
    "Direct lighting + holofoil glare can mask or mimic light surface wear.",
    "Card appears to be under plastic (sleeve or toploader), which softens fine detail and can hide or add reflections.",
    "No raking/angled light photos to reveal surface texture, indentations, or subtle dents.",
    "Exact border measurements (in mm or %) and corner magnification are not possible.",
    "Color accuracy and any potential fading are harder to judge under the photo's lighting."
  ],
}
`.trim();


const collectorsAnalysis: string =
`
You are a professional pokemon collector, and you are hired to rank cards for serious
collectors. you need to rank a card professionally. Take your time,
get as much data as possible, from as many trustworthy sources as possible.
give it a score from 1-100 where 100 would be the most desired card among collectors.
You must reasearch as deeply as possible (using reliable sources) before estimating the card,
to avoid giving different scores to the same card when asked again later.

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
collectors should approach it. The verdict field is a 1 sentence summary of the finalNote field, maximum 15 words.

totalScore
verdict
overview
categories - each categori has fields: score, name, text
finalNote


Now rank this card:

`;



const isWorthGrading: string =
`
You are a PSA grader for pokemon cards.
You need to analyze if it makes financial sense to get a card PSA graded.
Assume the card is in the area of average to good condition, and then see if the numbers
involved makes it profitable.


Do the following:

1. Research the current market values (raw + PSA 8/9/10). Only use reliable sources.
  Fint out how sales volume are for the card.
2. Research grading costs, fees etc
3. Give a recommendation

Specifially for prices on (raw + PSA 8/9/10), make it an estimated average price-range.
for example "$32-$38". In grading cost, mention the things you included for the number
in the form of summary/keywords, place the text before the number. Must be under 10 words.

Return a clean JSON object with exactly these keys:
- verdict: A short, direct conclusion (1 sentence). Don't mention sales volume in this field.
- market_summary: An object containing raw value, PSA 8, PSA 9, PSA 10, and grading cost
- summary: Make it clear why and how the numbers add up. Shortly mention recent prices and sales volume, and its sources (keep it conscise).Make it easy to read for humans, dont use too many details and prices.
- action: A concise summary. 1-3 sentences. Keep it straight to the point and only valueable information.

Card to analyze:

`;

export const getBiggestMovers: string =
`
Please summarize each card in "The Biggest Price Spikes in Pokémon this Week" article from
TCG. Use the most recent you can find. Always remember to include all the
price values mentioned in the article. For every card you must mention the price values from the article.
Keep things conscise and to the point. The summary should be about 3-5 sentences for each card.

- report_link is url to the report you used.
- spike_summar summarizes the price spikes in the cards report. Specify if number is from sale or a listing/available.

Return only a valid JSON format as the one below. No text added before or after.

{
  "date": "Publication date of the report",
  "report_link": "",
  "cards": [
    {
      "rank": "",
      "card_name": "",
      "summary": "",
    }
  ]
}
`

export const getGeneralNewsPrompt: string =
`
You are an expert researcher for serious Pokémon TCG collectors and investors.
Provide the latest and most important news from the past 30 days only.
Focus on: major set announcements, valuable card reveals, population report updates,
price spikes/crashes, grading news, tournaments, scandals, official PSA/Beckett/CGC updates,
and high-value sales. Use reliable sources. Choose accurate short labels, such as
"release", "set reveal", "promo", "market", "grading", "population", "high-value sale", "restock", "competitive", "industry"

Respond strictly in this JSON format (no extra text outside the JSON):

{ "date": "YYYY-MM-DD", "items":
 [
{ "headline": "Short headline",
  "label": "new release",
  "summary": "1-4 sentence summary",
   "action": ["Bullet point 1 if valuable", "Bullet point 2"],
   "url": "https://direct-article-link.com" }
    ]
 }

 Rules: Limit to top 5-8 items. "action" array: only 1-3 bullets if they add real value
 (why important + how to act); leave empty array [] if redundant or minor.

 Include "url" only if it's a direct link to a specific article.
 Never use a link thats just a generel site or news section, only if its a specified article.
 Dont put links to youtube videos. The url link must be the actual http link so user can see
the source. Prioritize high-impact news for serious collectors/investors.
Use today's date for reference.

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

export function sellMyCardPrompt(
  cardName: string,
  setName: string,
  cardNumber: string | number
): string {
  return `${sellMyCard.trim()}

Card details:
"card-name": ${JSON.stringify(cardName)}
"set-name": ${JSON.stringify(setName)}
"card-number": ${JSON.stringify(String(cardNumber))}`;
}

export function salesDataPrompt(
  cardName: string,
  setName: string,
  cardNumber: string | number
): string {
  return `${salesData.trim()}

Card details:
"card-name": ${JSON.stringify(cardName)}
"set-name": ${JSON.stringify(setName)}
"card-number": ${JSON.stringify(String(cardNumber))}`;
}
