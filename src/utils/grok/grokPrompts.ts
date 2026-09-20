import type {
  GrokImageContent,
  GrokMultimodalMessage,
} from "./grokPromptTypes";

const extraToolsInstructions = `
Complete all tool calls internally before producing the final response.
Never mention web_search, code_interpreter, search queries, or any planning steps. No intermediate steps in response ever.
Return only an answer once you have produced the final output which can fit the JSON schema shown below.
`.trim();

export const marketAnalysisInstructions: string = `
${extraToolsInstructions}

If there are multiple variants of this card, choose the most common one. Do not blend variants, choose only one.

# TASK
Give a score 1-100 on how healthy and functional the markets are for this card. The score is only market-focused, we don't care about it as a collectable.

# OUTPUT
Answer only in the following JSON schema. No text added before or after the JSON object.
Output must be purely market focused, do not mention its position as a collectable or as a grading candidate.

{
"set_name":"set name of the card",
"variant_name":"Official print/variant name of the card you researched",
"score":"score 1-100. Only return an Integer",
"headline":"One sentence summary which to let me know it's position in the market. Max 15 words.",
"market_signals":{
	"demand":{
		"score":"score 1-100. Only return an Integer",
		"explanation":"Explain concisely why it deserved the score you gave. Be clear but dont list out comps"
	},
	"liquidity":{
		"score":"score 1-100. Only return an Integer",
		"explanation":"Explain concisely why it deserved the score you gave. Be clear but dont list out comps"
	},
	"stability":{
		"score":"score 1-100. Only return an Integer",
		"explanation":"Explain concisely why it deserved the score you gave. Be clear but dont list out comps"
	},
	"momentum":{
		"score":"score 1-100. Only return an Integer",
		"explanation":"Explain concisely why it deserved the score you gave. Be clear but dont list out comps"
	}
},
"healthiest_segment": {
"label": "Concisely state which grade or condition appears to be the most healthy and functional in the markets. Preferably only 1 grade and/or 1 condition.",
"explanation": "Very concisely describe the market health and functionality at the grades/condition you mentioned in label"
},
"market_balance": {
"label":"buyer_favored | balanced | seller_favored | unclear",
"explanation": "Concise explanation of why it deserved the label you gave. Clarify if it's different across grades or conditions"
},
"price_discovery": {
"label":"weak | normal | strong | unclear",
"explanation": "Concise explanation of why it deserved the label you gave. Clarify if it's different across grades or conditions"
},
"eyes_on": {
"label":"a fitting label/title for whats most interesting/valueable to keep my eyes on when it comes to this card in the market",
"explanation":"Explain concisely."
},
"outlook": {
"near_term": {
	"label": "very negative | negative | stable | positive | very positive",
	"explanation": "Explain why it deserved the label you gave it."
},
"long_term": {
	"label": "very negative | negative | stable | positive | very positive",
	"explanation": "Explain why it deserved the label you gave it."
},
"upside_drivers": [
	""
],
"risks": [
	""
]
}
}

# OUTPUT RULES
- keep it market focused.
- Use neutral language with a neutral tone, avoid financial jargon, phrases or slogans.
- all "explanation" fields should use normal sentence structure, preferably avoid semicolons or colons. They should also give a sense of what held the score back.
- Never say "across conditions". Clarify if it's raw, graded, or both.

# FIELD INPUT GUIDE
- All "score" fields must be whole integers from 1 through 100. Return them as JSON numbers, not strings.
- "Demand" → Describe the demand from a market perspective, not collectable.
- "Liquidity" → How frequently and easily do the card transact.
- "Stability" → How consistent realized prices are. Not whether they're rising or falling.
- "Momentum" → Direction and strength of recent price/volume movement. Also clarify if it seems like genuine price movement or uncertain evidence.
- "price discovery" → how clearly and reliably the market is establishing a fair current price. Do sources agree/disagree?
- "eyes_on" must always be present. Fill it only when there is something valuable to monitor for this card in the market. Otherwise return null.

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

# TASK
Rate this card as a collectible for Pokemon collectors on a scale of 1-100.

### Core Rules
- Identify every distinct English variant/print. All variants must be from the same set, don't use multiple sets.
- Analyze each English variant separately. Never blend or average different variants.
- Treat each variant as an independent analysis.
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
      "finalNote": ["Reasoning for the totalScore. You can add facts or history about the card if it's valuable to a collector. If this variant is tricky to identify, then clarify how to do that. Explain how this variant fits into a collection and the collection hobby as a whole. This is an array so that lengthy texts can be split into paragraphs"]
    }
  ]
}

### Additional Guidance
- The totalScore should be a thoughtful overall assessment, not a simple average of the five categories,
  those are scored independently.
- Keep the overview concise and collector-focused.
- Every English variant is an item in the "analyses" array. Each variant must have its own complete analysis.

# OUTPUT RULES
- In all fields named "text" and "finalNote" don't truncate or shorten the text.
- In all fields named "text" be specific and detailed.
- Explaining how to identify a variant should ONLY be explained in finalNote.

`.trim();

export const worthGradingInstructions: string = `
  ${extraToolsInstructions}

  # TASK
  Research the grading economics for this card at PSA7,8,9,10 including selling fees/costs. We want the expected NET incremental gain for grading & selling versus selling raw. We want to calculate this for each grade. Default/primary source for price data should be PriceCharting, if you skip it as a source you need good a reason for it. You can combine price sources to estimate expected selling prices. Use reliable sources for all data.
  Choose only 1 variant, the one that matches my card the best.

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

  In the JSON schema, each variant is an entry in the "variants" array inside the JSON object.

  {
  "variants":[
  {
  "card": {
  "name": "",
  "set": "",
  "number": "",
  "variant_name": "The official variant/print name of the card you researched"
  },
  "attractiveness_level": {
  "score":"Score 1-100 on how attractive this variant is to submit for grading all things considered, relative to other Pokemon cards. This is without knowing what grade it will come back as. Must be a string containing only the score, for example '65'",
  "reasoning":["Explain why it deserved the score you gave it, outside of just the paper profit numbers. You don't need to explain profit levels since we already display this in other fields. I should have a sense of what dragged the score down, and what pulled it up. If long turnaround times is an issue/relevant then mention it. Use neutral language with a neutral tone. Don't shorten or truncate the text. Always describe this as its score, instead of attractiveness. This field is an array so that lengthy texts can be split into paragraphs"]
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
  "potential": "",
  "headline": "",
  "bottom_line":"",
   "risk_profile":{
   "label":"low | average | high | very high ",
   "explanation":"explain why it deserved the label you chose. If there are risks or pitfalls that affects this card more than a typical card, mention it. Use neutral language with a neutral tone."
  }
  }
  ]
  }

# OUTPUT RULES
output rules for the following text fields ("title", "bottom_line", "reasoning", "explanation"):
- Use only neutral language with a neutral tone.
- Avoid financial jargon, phrases or slogans.
- Avoid truncation and semicolons.
- Titles must be plain labels, not slogans.
- Always say PSA 7, PSA 8, PSA 9, and PSA 10. Never say "a seven", "an 8", "a nine", "a ten"
- Do not omit "PSA" in titles.
- Do not use telegraphic titles such as "Ten pricing is soft" or "An 8 still works".
- Spell out dollar amounts as $1,475 not "1475 dollar".
- When mentioning profits, always use the numbers from our calculations in schema and only refer to it as paper profits.
- You don't need to state profits, fees or costs in these fields since we are already doing that in other fields.
- Never refer to data or a source as a "snapshot"
- Never cite the specific sources for PSA population data.

The field "potential" describes how much net incremental gains are available if my card comes back as a perfect PSA10. Must choose exactly one of these labels "negative", "very low", "marginal", "modest", "good", "high", "very high". If PSA10 sales data is completely unavailable, then measure against the highest PSA grade which has sales data available.

label definitions:
"negative": below 0$
"very low": $0 to $75
"marginal": $76 to $150
"modest": $151 to $400
"good": $401 to $1,000
"high": $1,001 to $5,000
"very high": more than $5,000

The field "headline" is a headline version of its general attractiveness for submission outside of just looking at paper profit numbers. This is without knowing what grade it will be. If you mention something about profits, it must align with our calculations in the schema. Maximum 25 words.

The field "bottom_line" A simplified concise conclusion if grading make sense, and under what conditions or circumstances. Do not list out profit levels or explain higher grade has higher profit, everybody knows that. If you mention something about paper profit, don't measure it with pricecharting figures, simply state it. Don't shorten or truncate. Don't explain that aiming for a PSA10 is gambling or unrealistic since that's self-explanatory.

PSA Population:
Use the public PSA Population Report on psacard.com first. Make sure you have the correct card (set, card number and variant).
PSA also has login-only Research/API tools. If those require login, do not assume the data is private. Check the public Population Report.
If a public PSA page redirects to sign-in, try another public PSA page for the same card. Only if no public PSA page shows the counts do you use other reliable sources. Provide the url to the exact page that displays the numbers.
If you can't find psa population data from a reliable source then return null (don't invent numbers).

Don't forget to populate "psa_population_psa6" when filling in psa_population data.

raw_sale_today.estimated_fees_usd = estimated ebay selling fee
raw_sale_today.net_proceeds_usd = raw_sale_today.gross_sale_usd - raw_sale_today.estimated_fees_usd

For each graded_scenarios entry:
net_profit_vs_raw_usd = expected_sale_price_usd - psa_grading_fee_usd - shipping_and_insurance_usd - ebay_fees_usd - raw_sale_today.net_proceeds_usd
roi_vs_raw_net_percent = net_profit_vs_raw_usd / raw_sale_today.net_proceeds_usd × 100

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
