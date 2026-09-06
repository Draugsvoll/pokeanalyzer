import type {
  GrokImageContent,
  GrokMultimodalMessage,
} from "./grokPromptTypes";

const extraToolsInstructions = `
Complete all tool calls internally before producing the final response, no matter how easy the task is.
Never mention web_search, code_interpreter, search queries, or any planning steps.
Return only the final analysis as the required JSON object.
`.trim();

export const priceAnalysisInstructions: string = `
If the data is available, please show today's market prices for the Pokemon card I provided.

Only use sources outside of tcgplayer and cardmarket. Only use sources that are reliable.
Make sure to include the source "PriceCharting" if it has available data.
When using PriceCharting, make sure to include the most recent sales data for the card, and include the range of prices for the most recent sales, if it's available.
If you can't find any reliable sources outside of tcgplayer and cardmarket, leave it empty.

In market_data field, you can add different types of market price data, as long as its
relevant and valuable to the reader. Make sure the market_price field actually reflects the
current realistic price of today.

notes field should be concise and user-friendly to read. Its a summary.

Respond in the JSON format provided below. Your entire response must only be a valid JSON object, never add any text before or after the JSON object.
I repeat because this is important, your entire response can ONLY be a valid JSON object, never add any text/characters/symbols before or after the JSON object.

All fields are optional, and shall only be filled if you have reliable data.

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
      "source": "CardMarket",
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
      "notes": "",
      "url": "https://pokescope.app/card/ex3-5/"
    }
  ],
  "last_updated": "2026-07-13",
  "currency_reference": {
    "primary": "USD",
    "secondary": "EUR"
  }
}
`.trim();

const variantPrintNameInstructions = `
The variant field must contain the official and commonly used variant name for the card. For example, "Unlimited Holofoil", "1st Edition Shadowless Holofoil", "Reverse Holofoil", etc.
`.trim();

export const salesDataInstructions: string = `
Can you fetch sold data based on grading for this card at PriceCharting website?

I need this for every English variant of the card.

Respond in the JSON format provided below. The JSON example below shows you formatting/structure, it doesn't contain real live data. Your entire response must only be a valid JSON object, never add any text before or after the JSON object.
I repeat because this is important, your entire response can ONLY be a valid JSON object, never add any text/characters/symbols before or after the JSON object.

The "volume" field in our schema refers to the volume displayed for each grade on PriceCharting.

If data is not available for a field, just leave the field empty.
The root JSON value must be an object. Each item in the "variants" array is an English variant.
Each variant entry must include the variant name in the "variant" field.

${variantPrintNameInstructions}

{
  "variants": [
    {
      "variant": "Unlimited Holofoil",
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
      "url":"Direct link to where you fetched the prices from. Must be link for the specific card/variant"
    }
  ]
}

`.trim();

const identifyCard: string = `
Identify the exact Pokemon card provided in the image. Return a valid JSON containing
these fields:

- Pokemon name
- set name
- card number
- set series
`;

const authenticityCheck: string = `
You are a professional Pokemon-card inspector. Verify if my Pokemon card is real from image(s) provided. Do a thorough analysis, take your time.
Your response must be in a valid JSON format as shown below.
Don't subtract from the score because you can't do physical tests on it,
just make note of it in limitations. If user doesn't supply the back of the card,
explain how much that is shaving off the final score (inside the limitation field).
If the image is hard to read, don't just make assumptions. Note what was hard to scan and
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

`;

const psaGrading: string = `
Do a PSA grading of this Pokemon card. Be as strict and thorough as a professional grader.
Be objective about the card. If the image has limitations where its hard to determine condition
on a detail, assume its closer to an average condition. Also mention everything about the image
that limits your grading process. Scan the image as detailed as possible so no details get lost
in the process. Don't invent anything about the condition.

Give a roughly estimated score for each category: Centering, Corners, Edges, Surface.

Give a summarized report (Don't mention you did something because that's what I told you).
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
  ]
}
`.trim();

export const collectorsAnalysisInstructions: string = `
${extraToolsInstructions}

You are an expert Pokémon TCG collectible analyst.

Your task is to rate the provided card as a collectible for Pokémon collectors on a scale of 1-100.

### Core Rules
- Identify every distinct English variant/print that has reliable collector data.
- Analyze each English variant separately. Never blend or average different variants.
- In "variant_name" field insert the official and commonly used variant name for the card. For example, "Unlimited Holofoil", "1st Edition Shadowless Holofoil", "Reverse Holofoil", etc.
- Completely ignore Japanese and all non-English variants.
- Never invent anything.
- All scores must be whole numbers written as strings (example: "84").
- Your entire response must be a single valid JSON object. No text, markdown, or explanation before or after the JSON.

### Scoring Categories
For every variant, score these five categories independently from overall score:
1. Rarity & Scarcity
2. Collectors Demand
3. Significance
4. Artwork & Aesthetics
5. Long-Term Collectibility

### Required JSON Structure
{
  "analyses": [
    {
      "variant_name": "The variant name, as explained in core rules above",
      "totalScore": "XX",
      "verdict": "One sentence, maximum 15 words, summarizing the finalNote.",
      "overview": "1-3 sentences about the card’s role as a collectible only. Do not mention scores, prices, or Pokémon stats.",
      "categories": [
        {
          "name": "Rarity & Scarcity",
          "score": "XX",
          "text": "Justification"
        },
        {
          "name": "Collectors Demand",
          "score": "XX",
          "text": "Justification"
        },
        {
          "name": "Significance",
          "score": "XX",
          "text": "Justification"
        },
        {
          "name": "Artwork & Aesthetics",
          "score": "XX",
          "text": "Justification"
        },
        {
          "name": "Long-Term Collectibility",
          "score": "XX",
          "text": "Justification"
        }
      ],
      "finalNote": "Reasoning for the totalScore. You can add facts or history about the card if it's valuable to a collector. Explain how this variant fits into a collection and the broader market."
    }
  ]
}

### Additional Guidance
- The totalScore should be a thoughtful overall assessment, not a simple average of the five categories,
  those are scored independently.
- Keep the overview concise and collector-focused.
- Every English variant is an item in the "analyses" array. Each variant must have its own complete analysis.

Now analyze the card.

`.trim();

export const worthGradingInstructions: string = `
  ${extraToolsInstructions}

  I own this card. Can it make sense to grade & sell it, instead of just selling it raw?

  I need to know this for every English variant of the card, as long as it has reliable data available. Don't include Japanese variants.

  Break down the grading economics for PSA7,8,9,10 including selling fees/costs. We want the expected
  NET incremental gain for grading & selling versus selling raw. We want to calculate this for each grade.
  Default/primary source for price data should be PriceCharting, but you can use others if you have a strong
  reason to. Mention which source you used in "assumptions", if you didn't use PriceCharting explain why.
  Use reliable sources for all data.

  Remember ebay can have different fee structure/model for high prices, account for that in calculations.

  In each individual calculation, you have to justify the PSA grading tier/fee you chose.
  Explain this inside the field "grading_tier_justification" which exists for each grade
  calculation field in the JSON schema provided further down. You have to pull live fees and turnaround times.
  If you couldnt find exact grading fees or turnaround times, then you MUST mention it in the psa_note field.
  If there are any issues with the grading tier fee or turnaround time,
  such as temporarily locked or paused, mention it in the field "psa_note".
  This applies to each individual grade. This field is ONLY used to notify me about these types of issues,
  if no issues return null.

  For "graded_scenarios" section:
  psa_grading_fee_usd is the PSA grading tier fee for that grade.
  shipping_and_insurance_usd is estimated shipping to PSA, return shipping and insurance.

  Don't invent numbers or facts. If data is unavailable or not from a reliable source, return null.

  The field "shipping_and_insurance_usd" is simply an estimation. Make sure each PSA-grade individually uses a reasonable shipping and insurance estimation.

  Respond in the JSON format provided below. Your entire response must only be a valid JSON object, never add any text before or after the JSON object.

  Always include every English variant where you can find data from reliable sources.
  in variant_name field give the proper and official variant name.
  In the JSON schema, each variant is an entry in the "variants" array inside the JSON object.

  {
  "variants":[
  {
  "card": {
  "name": "",
  "set": "",
  "number": "",
  "variant_name": ""
  },
  "assumptions": [
    {"title":"title for the assumption", "assumption":"describe the assumption"}
  ],
  "confidence_level":{
  "score":"Score 1-100 on how confident you are in the analysis itself. Must be a string containing only a number. For example '83'",
   "reasoning":"Explain why you are feeling this level of confidence in your analysis as a whole. Make it concise and beginner friendly. Use conversational language with a professional tone. If the score is below 80, make it clear what's dragging it down."
  },
  "attractiveness_level": {
  "score":"Score 1-100 on how attractive this variant is to submit for grading all things considered, relative to other Pokemon cards. Must be a string containing only a number, for example '65'",
  "reasoning":["Justify the score. We are interested in WHY the card is attractive or not, not just the paper profit numbers. I should have a basic understanding of why it didn't score higher or lower. Do not contradict paper profit calculations. Break it down into paragraphs"]
  },
  "raw_sale_today": {
    "gross_sale_usd": null,
    "estimated_fees_usd": null,
    "net_proceeds_usd": null,
    "time_to_sell": ""
  },
  "graded_scenarios": [
  {
    "grade": "PSA 7",
    "expected_sale_price_usd": null,
    "grading_tier": "",
    "grading_tier_justification": "",
    "psa_grading_fee_usd": null,
    "shipping_and_insurance_usd": null,
    "ebay_fees_usd": null,
    "ebay_fee_model": "State which eBay fee model you used",
    "roi_vs_raw_net_percent": null,
    "net_profit_vs_raw_usd": null,
    "turnaround_time": "",
    "psa_note": null
  },
  {
    "grade": "PSA 8",
    "expected_sale_price_usd": null,
    "grading_tier": "",
    "grading_tier_justification": "",
    "psa_grading_fee_usd": null,
    "shipping_and_insurance_usd": null,
    "ebay_fees_usd": null,
    "ebay_fee_model": "State which eBay fee model you used",
    "roi_vs_raw_net_percent": null,
    "net_profit_vs_raw_usd": null,
    "turnaround_time": "",
    "psa_note": null
  },
  {
    "grade": "PSA 9",
    "expected_sale_price_usd": null,
    "grading_tier": "",
    "grading_tier_justification": "",
    "psa_grading_fee_usd": null,
    "shipping_and_insurance_usd": null,
    "ebay_fees_usd": null,
    "ebay_fee_model": "State which eBay fee model you used",
    "roi_vs_raw_net_percent": null,
    "net_profit_vs_raw_usd": null,
    "turnaround_time": "",
    "psa_note": null
  },
  {
    "grade": "PSA 10",
    "expected_sale_price_usd": null,
    "grading_tier": "",
    "grading_tier_justification": "",
    "psa_grading_fee_usd": null,
    "shipping_and_insurance_usd": null,
    "ebay_fees_usd": null,
    "ebay_fee_model": "State which eBay fee model you used",
    "roi_vs_raw_net_percent": null,
    "net_profit_vs_raw_usd": null,
    "turnaround_time": "",
    "psa_note": null
  }
  ],
  "psa_population": {
  "source": "",
  "psa_population_total": null,
  "psa_population_psa10": null,
  "psa_population_psa9": null,
  "psa_population_psa8": null,
  "psa_population_psa7": null,
  "psa_population_psa6": null
  },
  "recommendation": {
  "potential": "",
  "headline": "",
  "bottom_line":"",
  "notes":[""]
  }
  }
  ]
  }

Writing rules for the following text fields ("title", "headline", "bottom_line", "notes", "reasoning"):
- Write like a collector explaining the card to another collector. The tone and language should sound professional.
- Avoid truncation and semicolons.
- Titles must be plain labels, not slogans.
- Always say PSA 7, PSA 8, PSA 9, and PSA 10. Never say "a seven", "an 8", "a nine", "a ten"
- Do not omit "PSA" in titles.
- Do not use telegraphic titles such as "Ten pricing is soft" or "An 8 still works".
- Good title examples: "PSA 8 is the lowest grade that still beats selling raw", "PSA 10 sold data for this print is thin".
- Bad title examples: "An 8 still works", "Ten pricing is soft"
- Spell out dollar amounts as $1,475 not "1475 dollar".

The field "potential" describes how much net incremental gains are available if my card comes back as a perfect PSA10. Must choose exactly one of these labels "negative", "very low", "marginal", "modest", "good", "high", "very high".

label definitions:
"negative": below 0$
"very low": $0 to $75
"marginal": $76 to $150
"modest": $151 to $400
"good": $401 to $1,000
"high": $1,001 to $5,000
"very high": more than $5,000

The field "headline" is a headline version of "reasoning" inside attractiveness_level. Maximum 25 words.

The field "bottom_line" is an overall recommendation/guide with all things considered. Do not break down calculations/costs/fees as we already have a field doing that. If grading isn't recommended/attractive even though it's showing over 100usd paper profits then you should justify that. A beginner should be able to understand why or how something affects the grading decision on a practical level. Make things clear and straightforward. Don't explain that aiming for a PSA10 is gambling or unrealistic, that's self-explanatory.
Adjust the strength of your wording proportionally to the size of the actual edge or risk.
When mentioning probabilities or expected values, explain how you calculated them
and what data or assumptions you used.
Don't claim a probability-weighted expected value without justifying how you concluded that.

The field "notes" is an optional field. If there are any important or valueable considerations for grading this exact card/variant that hasn't been mentioned already, put it in here. If everything important and valueable has already been adressed, leave it empty,

In the field "assumptions" mention your assumptions.

PSA Population:
Use the public PSA Population Report on psacard.com first. Make sure you have the correct card (set, card number and variant).
PSA also has login-only Research/API tools. If those require login, do not assume the data is private. Check the public Population Report.
If a public PSA page redirects to sign-in, try another public PSA page for the same card. Only if no public PSA page shows the counts do you use other reliable sources. Provide the url to the exact page that displays the numbers.
If you can't find psa population data from a reliable source then return null (don't invent numbers).

Don't forget to populate "psa_population_psa6" when filling in psa_population data.

When calculating Profit vs Raw and ROI:
Calculate Raw Net = Raw sale price - selling fees on the raw sale.
Calculate Graded Net = Graded sale price - grading costs - selling fees on the graded sale.
Profit vs Raw = Graded Net - Raw Net
ROI = (Graded Net - Raw Net) / Raw Net * 100

Never use the raw sale price directly as the baseline without subtracting its selling fees.

`.trim();

export const biggestMoversInput: string = `
Please summarize all the cards in "The Biggest Price Spikes in Pokemon this Week" article from
TCG website.

`.trim();

export const biggestMoversInstructions: string = `
Use the most recent article you can find. Respond using the JSON format provided below.

### Strict Process Rules
1. Identify all the cards that are individual pokemons and mentioned both by their name and a set name.
2. Summarize the identified cards in the article by including all price-values and price-movements mentioned in the article,
  include the explanation for the spike if it is mentioned.


- report_link is url to the report you used.

{
  "date": "Publication date of the report",
  "report_link": "",
  "cards": [
    {
      "card_name": "",
      "summary": ""
    }
  ]
}

`.trim();

export const generalNewsInput: string = `
You are a researcher for Pokemon TCG collectors and investors. Your job is to collect the most important and valueable news.
`.trim();

export const generalNewsInstructions: string = `
Provide the latest and most important news from the past 30 days (as of today's date) for Pokemon TCG collectors and investors.
Focus on (but not limited to): major set announcements, valuable card reveals, population report updates,
price spikes/crashes, grading news, tournaments, scandals, official PSA/Beckett/CGC updates,
and high-value sales.

Use reliable sources. Choose accurate short labels, such as
"release", "set reveal", "promo", "market", "grading", "population", "high-value sale", "restock", "competitive", "industry"

Respond in the JSON format provided below. Your entire response must only be a valid JSON object, never add any text before or after the JSON object.

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

 Only populate "url" field if it's a direct link to a specific article, otherwise leave it empty.
  Never add a link that's just a generic homepage or news section, only add if it links directly to an article or the content.
  For example never add a link like "https://www.pokemon.com/us/pokemon-news/", but if you have a specific article, add that link.
  Don't put links to YouTube videos. The url link must be the actual http link so user can see
  the source. Prioritize high-impact news for serious collectors/investors.

  Use today's date for reference in "date" field.

`.trim();

export function worthGradingInput(cardNameAndSet: string): string {
  return `"${cardNameAndSet}"`;
}

export function collectorsAnalysisInput(cardNameAndSet: string): string {
  return cardNameAndSet;
}

export function identifyCardPrompt(
  frontImageBase64: string,
): GrokMultimodalMessage {
  return {
    role: "user",
    content: [
      { type: "input_text", text: identifyCard.trim() },
      { type: "input_image", image_url: frontImageBase64 },
    ],
  };
}

export function priceAnalysisInput(
  name: string,
  setName: string,
  number: string | number,
): string {
  return `"name": ${JSON.stringify(name)},
          "set": ${JSON.stringify(setName)},
          "number": ${JSON.stringify(String(number))},`;
}

export function salesDataInput(
  cardName: string,
  setName: string,
  cardNumber: string | number,
): string {
  return `Card details:
"card-name": ${JSON.stringify(cardName)}
"set-name": ${JSON.stringify(setName)}
"card-number": ${JSON.stringify(String(cardNumber))}`;
}

export function PsaGradingPrompt(
  frontImageBase64: string,
  backImageBase64?: string,
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
  backImageBase64?: string,
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
