import type { GrokImageContent, GrokMultimodalMessage } from "./grokPromptTypes";

export const priceAnalysis: string =
`
If the data is available, please show today's market prices for the Pokemon card I provided.

Only use sources outside of tcgplayer and cardmarket. Only use sources that are reliable.
Make sure to include the source "PriceCharting" if it has available data.
When using PriceCharting, make sure to include the most recent sales data for the card, and include the range of prices for the most recent sales, if it's available.
If you can't find any reliable sources outside of tcgplayer and cardmarket, you leave it empty!

In market_data field, you can add different types of market price data, as long as its
relevant and valuable to the reader. Make sure the market_price field actually reflects the
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

const variantPrintNameInstructions = `
The variant field must contain only the variant/print name, not the Pokemon-name or set-name.

Examples:
"Unlimited Holo"
"Shadowless Holo"
"1st Edition Holo"
"Reverse Holo"

Do not include the Pokemon/card name in the variant field.
If 2 variant names end up identical for some reason (which shouldn't happen), then also include the set name so we can tell them apart. For example, "Unlimited Holo (Base Set)" or "Unlimited Holo (Jungle)".
We only do that if the variant names are identical and we need to differentiate them.
Use precise official/common print terms such as "Holo", "Reverse Holo", "Non-Holo", "1st Edition", "Unlimited", or "Shadowless".
Do not call a variant "Non-Holo" if the actual print is Reverse Holo.
Don't mix up "Reverse Holo" with "Holo".
"Holo" and "Reverse Holo" are different variants and must never be merged.
If PriceCharting has separate pages for Holo and Reverse Holo, return them as separate variant entries.
If you are unsure whether a print is Reverse Holo, Holo, or Non-Holo, verify from reliable sources before naming the variant.

If PriceCharting has only one English variant available but you are unsure about the variant name,
do additional research using reliable sources to try and identify it more accurately.
`.trim();

const salesData: string = `
Can you fetch sold data based on grading for this card at PriceCharting website?

Response must be only a valid JSON format. No extra text before or after the JSON format.
Response must be put into the exact structure as the example response below.
If data not available just leave the field empty.
The root JSON value must be an array. Each item in the array is one English variant.
Each variant entry must include the variant name in the "variant" field.

${variantPrintNameInstructions}

Notes field is optional for each variant. If there's valuable information related to that specific variant
that collectors would want to know, then add it. Each note is a string in the notes array.

[
  {
    "variant": "Unlimited Holo",
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
    "notes": []
  }
]


`

const sellMyCard: string = `
  How much should I sell this card for? Give a summarized response as valid JSON.
  Use reliable sources (PriceCharting, PokeScope, and eBay are good examples)
  No extra text before or after the JSON.
  Include multiple English variants when they exist.
  The root must be an object with a "variants" array and a "marketplace_availability" array.
  Each variant must contain a "variant" and a "steps" array.
  Each step must contain a "title" and a "substeps" array.
  The marketplace_availability category exists outside the array of variants.
  Everything else should be the very same format inside each variant.

  ${variantPrintNameInstructions}
  Do not confuse the "variant" field with the "variants" array. They are different:
  - "variant" is the name of one specific print/variant of the card.
  - "variants" is the array containing all variant entries for the card.

  For each variant:
  The first category must be price recommendations, include different conditions/grading.

  Don't make a step about inspecting condition.

  The second category: How fast can I realistically expect to sell this card? Consider different markets and conditions.

  Third category lets me know the general sales volume of this card and what sources everything is based on.
  Use reliable sources and make sure we know roughly how often it sells. For example per week, month, or year.
  Use one substep per grading category.

  Marketplace available category: I need to know different marketplaces available and what each one is best for.
  This category must exist outside the array of variants.

  Other category (optional): Include any other valuable information that doesn't apply generically to most or all cards.
  Each variant can include an optional "notes" array.

  Don't blend different categories together. Name each step based on its content.

  Example response:

  {
    "variants": [
      {
        "variant": "Unlimited Holo",
        "notes": [
          "Collectors may pay more for strong holo swirl placement or unusually clean centering."
        ],
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
            "title": "Expected Sales Time",
            "substeps": [
              "",
              ""
            ]
          },
          {
            "title": "Sales Volume and Sources",
            "substeps": [
              "",
              "",
              "",
              ""
            ]
          }
        ]
      },
      {
        "variant": "Reverse Holo",
        "notes": [
          "Reverse holo demand can be more condition-sensitive than standard raw copies."
        ],
        "steps": [
          {
            "title": "Price Recommendations",
            "substeps": [
              {
                "label": "Near Mint",
                "price": "$40-$55"
              }
            ]
          },
          {
            "title": "Expected Sales Time",
            "substeps": [
              ""
            ]
          },
          {
            "title": "Sales Volume and Sources",
            "substeps": [
              ""
            ]
          }
        ]
      }
    ],
    "marketplace_availability": [
      {
        "label": "eBay",
        "recommendation": "Best for..."
      },
      {
        "label": "TCGPlayer",
        "recommendation": ""
      }
    ]
  }

`;

const identifyCard: string =
`
Identify the exact Pokemon card provided in the image. Return a valid JSON containing
these fields:

- Pokemon name
- set name
- card number
- set series
`

const authenticityCheck: string =
`
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

`

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
  ],
}
`.trim();


const collectorsAnalysis: string =
`
You are a professional Pokemon collector, and you are hired to rank cards for serious
collectors. You need to rank a card professionally. Take your time,
get as much data as possible from many trustworthy/reliable sources.
Give it a score from 1-100 where 100 would be the most desired card among collectors.
You must research deeply (using reliable sources) before estimating the card,
to avoid giving different scores to the same card when asked again later.

If a card has multiple English variants, we want an analysis for each one you can find reliable data on. Don't include any Japanese variants.

Do not include sibling cards, counterpart cards, same-artwork cards,
or related card numbers as variants to analyze. Only analyze variants of the exact card provided.
You may mention these related cards in finalNote if they are relevant for collectors.

You must justify exactly WHY it was given its score. a collector should walk away
understanding exactly why it deserved that score and feel more educated about the card.
The score should reflect your reasoning. The categories are as follows.

Rarity & scarcity
Collectors Demand
Significance
Artwork & Aesthetics
Long-Term Collectibility

Make the category long-term collectibility less weighted than the others,
but don't mention that. Give each category a score as well. All the scores are whole
numbers as a string. For example 43/100 is "43".

The response must only be a valid JSON object, no text added before or after.
The root object must contain an "analyses" array. Each item in the array represents one English variant you found.
Use exactly the field names and nesting shown in the example response below.


The overview field must be as concise and relevant to the collector as possible,
but it should only shortly explain the card's role as a collectible.
Don't explain the score or Pokemon stats in this field. Avoid stating exact price numbers for the card.
The finalNote field should be a summarized version of the reasoning behind the totalScore, also let the reader know
how this fits into an overall collection and the collection market.

The verdict field is a 1 sentence summary of the finalNote field, maximum 15 words.

Example response below. Use the exact same structure and field names. Never invent data.

${variantPrintNameInstructions}

{
  "analyses": [
    {
      "variant": "Unlimited Holo",
      "totalScore": "82",
      "verdict": "Iconic vintage holo with strong collector demand.",
      "overview": "A desirable vintage holo from an important set, with broad appeal among set collectors.",
      "categories": [
        {
          "name": "Rarity & scarcity",
          "score": "78",
          "text": "The card is not impossible to find, but clean copies and high-grade examples are meaningfully harder to source."
        },
        {
          "name": "Collectors Demand",
          "score": "88",
          "text": "Demand is strong because the Pokemon, artwork, set, and era are all recognizable to collectors."
        },
        {
          "name": "Significance",
          "score": "84",
          "text": "The card has lasting importance because of its place in the broader Pokemon collecting market."
        },
        {
          "name": "Artwork & Aesthetics",
          "score": "80",
          "text": "The artwork is memorable and fits the collector expectations for this era and print style."
        },
        {
          "name": "Long-Term Collectibility",
          "score": "76",
          "text": "Long-term interest should remain healthy, though upside depends on condition, supply, and broader market demand."
        }
      ],
      "finalNote": "This variant fits well as a recognizable collector piece, especially for condition-focused vintage collectors."
    }
  ]
}


Now rank this card:

`;



const isWorthGrading: string =
`
Can it make financial sense to grade this and sell it, instead of selling it raw today?

Break down the grading economics for PSA7,8,9,10 including selling fees/costs, showing us total expected ROI of grading it and then sell, versus selling it raw today. Use reliable sources.

Then give a recommendation. If it's not really recommended even though it's showing paper
profits, you must explain the reasons for that and how or why it affects the decision. A beginner should be able to easily understand it.
Make everything clear and specific so users can understand well.



The example below is written in very dry and data-driven language. You must instead write in clear, natural language.
Adjust the strength of your wording proportionally to the size of the actual edge or risk.
Be clear about probabilities and expected value.

Research current PSA population data for the exact card/variant, including total PSA population and grade-specific populations.
For PSA 7, PSA 8, PSA 9, and PSA 10, calculate each grade's percentage of the total PSA population.
Use that data to fill all PSA population fields. Do not forget any population fields.
Population fields include the PSA grade in their field name to make it clear which grade they refer to.
Use the correct grade-specific data for each field. Use reliable sources.
If data is not available for a field, leave the field empty, don't invent anything.

Your entire response must be a valid JSON object, no text added before or after.
The example response below shows the structure and format you must follow.
Never under any circumstances can you skip analysis and copy data below. You must always do
a proper analysis and then fill in the schema with your results.

{
"card": {
"name": "Charizard Holo",
"set": "Base Set Unlimited",
"number": "4/102",
"variant": "Holo Rare",
"year": 1999
},
"assumptions": {
"raw_market_price_usd": 500,
"grading_service": "PSA",
"grading_tier": "Regular",
"grading_fee_usd": 80,
"shipping_insurance_supplies_usd": 50,
"total_grading_cost_usd": 130,
"ebay_fee_rate_low": 0.135,
"ebay_fee_rate_high_value": 0.07,
"high_value_threshold_usd": 1000,
"notes": "Prices are approximate mid-2026 market averages from recent sold comps (PriceCharting, eBay, TCGPlayer aggregators). Raw assumes Near Mint / strong LP condition suitable for grading attempt. PSA fees reflect paused Value tiers (Regular is current entry). eBay high-value discount (50% off FVF on $1k+) applied where relevant. No taxes, no promoted listings, no membership amortization. Actual results vary with condition, market timing, and exact fees."
},
"raw_sale_today": {
"gross_sale_usd": 500,
"estimated_fees_usd": 68,
"net_proceeds_usd": 432,
"time_to_cash": "1-14 days"
},
"graded_scenarios": [
{
"grade": "PSA 7",
"expected_sale_price_usd": 750,
"grading_cost_usd": 130,
"ebay_fees_usd": 101,
"net_after_all_costs_usd": 519,
"roi_vs_raw_net_percent": 20.1,
"net_profit_vs_raw_usd": 87,
"psa_7_population": 12500,
"psa_7_population_percent": 31.2,
"break_even": true,
"notes": "Modest uplift. Fees and grading cost consume most of the premium."
},
{
"grade": "PSA 8",
"expected_sale_price_usd": 1400,
"grading_cost_usd": 130,
"ebay_fees_usd": 98,
"net_after_all_costs_usd": 1172,
"roi_vs_raw_net_percent": 171.3,
"net_profit_vs_raw_usd": 740,
"psa_8_population": 14200,
"psa_8_population_percent": 35.5,
"break_even": true,
"notes": "Solid paper profit after costs."
},
{
"grade": "PSA 9",
"expected_sale_price_usd": 2900,
"grading_cost_usd": 130,
"ebay_fees_usd": 203,
"net_after_all_costs_usd": 2567,
"roi_vs_raw_net_percent": 494.0,
"net_profit_vs_raw_usd": 2135,
"psa_9_population": 6000,
"psa_9_population_percent": 15.0,
"break_even": true,
"notes": "Strong return if achieved."
},
{
"grade": "PSA 10",
"expected_sale_price_usd": 20000,
"grading_cost_usd": 130,
"ebay_fees_usd": 1400,
"net_after_all_costs_usd": 18470,
"roi_vs_raw_net_percent": 4175.5,
"net_profit_vs_raw_usd": 18038,
"psa_10_population": 450,
"psa_10_population_percent": 0.5,
"break_even": true,
"notes": "Huge upside, but extremely low probability for a random Unlimited copy."
}
],
"probability_context": {
"psa_total_population": 40000
},
"recommendation": {
"should_grade": false,
"summary": "Generally not recommended for a typical raw Unlimited Charizard unless the card is visually exceptional (near-perfect centering, zero whitening, clean holo, sharp corners) and you have a high-confidence pre-grade opinion from an experienced grader or service.",
"reasons": [
"High population and commonality of Unlimited printings keep mid-grade premiums modest relative to total costs and risk.",
"PSA 7 barely covers costs + risk; PSA 8 is the realistic 'good' outcome for most decent copies and still requires waiting 1-3 months + capital tied up.",
"True PSA 10s are rare unicorns on this print run — chasing them with average cards is gambling, not investing.",
"Market liquidity is excellent raw; you can sell today and redeploy capital. Grading adds time risk (price drops, interest rates, opportunity cost).",
"Even when paper ROI looks positive on PSA 8/9, the probability-weighted outcome for an unassessed card is often close to break-even or slightly negative after realistic grade distribution.",
"Beginners frequently overestimate grade potential; whitening, print lines, and centering that look minor to the eye often drop the card a full grade."
],
"when_it_can_make_sense": [
"Card has been pre-screened and is a strong PSA 9+ candidate.",
"You already have other cards in a bulk submission so per-card shipping is diluted.",
"You plan to hold long-term regardless and want the protection/liquidity of a slab.",
"You enjoy the process and treat the grading fee as entertainment cost rather than pure ROI."
],
"beginner_advice": "Sell raw today if you need the money or want certainty. Only grade if the card looks dramatically better than average NM copies and you accept that a PSA 7 or 8 is the most likely result. Always check recent sold listings (not asking prices) on eBay and PriceCharting right before deciding."
},
"methodology": "Net = expected sale price − total grading cost − estimated eBay fees. ROI = (graded net − raw net) / raw net × 100. Fees approximate current eBay trading-card structure with high-value discount applied above $1,000. All figures are estimates for illustration; verify live comps and exact PSA/eBay rates before acting."
}

For fields with "_rate" in the field name, return decimal numbers only, exactly like the example above.
Example: use 0.135 for 13.5%, not "13.5%" or 13.5.

When calculating Profit vs Raw and ROI:
Calculate Raw Net = Raw sale price – selling fees on the raw sale.
Calculate Graded Net = Graded sale price – grading costs – selling fees on the graded sale.
Profit vs Raw = Graded Net – Raw Net
ROI = (Graded Net – Raw Net) / Raw Net × 100

Always show both the gross sale prices and the net figures so the comparison is apples-to-apples.
Never use the raw sale price directly as the baseline without subtracting its selling fees.

`;

export const getBiggestMovers: string =
`
Please summarize each card in "The Biggest Price Spikes in Pokémon this Week" article from
TCG. Use the most recent you can find. Always remember to include all the
price values mentioned in the article. For every card you must mention the price values from the article.
Keep things concise and to the point. The summary should be about 3-5 sentences for each card.

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
Never use a link that's just a general site or news section, only if it's a specified article.
Don't put links to YouTube videos. The url link must be the actual http link so user can see
the source. Prioritize high-impact news for serious collectors/investors.
Use today's date for reference.

`

export function isWorthGradingPrompt(cardNameAndSet: string): string {
  return `"${cardNameAndSet}"\n\n${isWorthGrading.trim()}`;
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
