export const marketPricesAnalysis: string =
`Do a comprehensive price estimation for this Pokémon card:

Golem ex Dragon Holo Rare Pokemon Card 5/97

Please include:
- Raw prices (Near Mint, Lightly Played ranges). both current prices and historic: 30days, 90days,180days.
- Graded prices (PSA 8, PSA 9, PSA 10 ranges if available) both current prices and historic: 30days, 60days,180days
- add a field for the last 18months to be used in a chart.
- Recent sales data and sources
- Market sentiment (bullish, stable, cooling, etc.)
- Why the price is what it is (supply, demand, nostalgia, population, etc.)
- Recommendation for both collectors and investors

Be transparent about data limitations and use the most recent available market data. if youre lacking data never invent any, just leave it empty. return everything in a valid json format string. when explaining the markets or giving recommendations it must be clearly articulated. the format must match the json format below


{
  "card": "Dark Slowbro 12 Team Rocket 1st Edition Holo Pokemon Card - SWIRL",
  "note": "Vintage 2000 Team Rocket 1st Edition Holo Rare (#12/82). Data compiled from PriceCharting, eBay sold listings, Sportscard Investor, and PSA as of July 2026. Prices in USD. Significant price volatility observed in raw copies; ranges reflect recent sales variation. PSA 10 values are estimates due to low sales volume. No invented data.",
  "raw_prices": {
    "near_mint": {
      "current": "80-160",
      "30_days": "70-140",
      "90_days": "90-170",
      "180_days": "80-150"
    },
    "lightly_played": {
      "current": "50-100",
      "30_days": "45-90",
      "90_days": "50-110",
      "180_days": "40-95"
    }
  },
  "graded_prices": {
    "PSA8": {
      "current": "150-220",
      "30_days": "140-210",
      "60_days": "130-200",
      "180_days": "120-190"
    },
    "PSA9": {
      "current": "310-400",
      "30_days": "300-380",
      "60_days": "280-360",
      "180_days": "250-350"
    },
    "PSA10": {
      "current": "800-3100",
      "30_days": "",
      "60_days": "",
      "180_days": ""
    }
  },
  "last_18_months": [
    {"month": "2025-01", "nm_avg": 95},
    {"month": "2025-03", "nm_avg": 110},
    {"month": "2025-05", "nm_avg": 105},
    {"month": "2025-07", "nm_avg": 120},
    {"month": "2025-09", "nm_avg": 100},
    {"month": "2025-11", "nm_avg": 85},
    {"month": "2026-01", "nm_avg": 95},
    {"month": "2026-03", "nm_avg": 110},
    {"month": "2026-05", "nm_avg": 100},
    {"month": "2026-07", "nm_avg": 90}
  ],
  "recent_sales": [
    {
      "date": "2026-07-07",
      "description": "Raw eBay sale",
      "price": "63.00",
      "source": "eBay / PriceCharting"
    },
    {
      "date": "2026-07-03",
      "description": "Raw TCGPlayer",
      "price": "114.75",
      "source": "TCGPlayer / PriceCharting"
    },
    {
      "date": "2026-06-29",
      "description": "Raw NM eBay",
      "price": "123.07",
      "source": "eBay"
    },
    {
      "date": "2026-06-28",
      "description": "PSA 8 eBay",
      "price": "196.50 - 199.99",
      "source": "eBay"
    },
    {
      "date": "2026-06-28",
      "description": "PSA 9 eBay",
      "price": "310 - 375",
      "source": "eBay / Sportscard Investor"
    },
    {
      "date": "Recent",
      "description": "PSA 10 estimates",
      "price": "800 - 3100",
      "source": "PriceCharting / PSA"
    }
  ],
  "market_sentiment": "Volatile with cooling in raw copies. High grades (PSA 9+) show stronger stability and collector demand. Recent raw sales indicate a correction after previous highs.",
  "why_price": "Limited 1st Edition print run from 2000 Team Rocket set creates scarcity. Strong nostalgia for WOTC-era holos, especially with swirl patterns. PSA population and high-grade demand drive premium on graded copies. Raw prices fluctuate due to condition sensitivity (centering, swirl quality) and broader vintage market corrections. Supply is finite while demand from set collectors remains consistent.",
  "recommendations": {
    "collectors": "Good addition for completing 1st Edition Team Rocket sets or vintage Dark-type collections. Prioritize NM+ raw with strong swirl or PSA 8/9 for better long-term appeal and preservation. High-grade PSA 9/10 offers strong eye appeal and set completion value.",
    "investors": "High grades (PSA 9/10) offer better liquidity and potential appreciation due to low population and collector premium. Raw copies are more speculative and volatile — better for short-term flips if bought at lower end of range. Overall, vintage 1st Edition holos have held value historically but face short-term market pressure."
  },
  "data_limitations": "Raw prices show high variance across recent sales (some as low as $40, others $160+); ranges reflect this spread. Exact 30/60/90/180 day historic data is limited and approximated from available trends. PSA 10 sales are infrequent, leading to wide estimate range. No full 18-month granular chart data publicly available without paid access. Data pulled primarily from PriceCharting, eBay sold listings, and Sportscard Investor as of early July 2026.",
  "data_points": [
    {
      "id": "pricecharting",
      "name": "PriceCharting",
      "datapoints": 60,
      "description": "Historic prices, volume stats, graded data, recent sales"
    },
    {
      "id": "ebay",
      "name": "eBay",
      "datapoints": 40,
      "description": "Recent sold listings and transactions"
    },
    {
      "id": "sportscardinvestor",
      "name": "Sportscard Investor",
      "datapoints": 15,
      "description": "Trend analysis, recent sales, 30-day changes"
    },
    {
      "id": "tcgplayer",
      "name": "TCGPlayer",
      "datapoints": 10,
      "description": "Market pricing and history"
    }
  ]
}

  "sources": "PriceCharting.com, Pikawiz.com, eBay sold listings, TCGPlayer, Sportscard Investor. Data as of early July 2026.",
  "market_sentiment": "Stable with slight cooling in raw copies. Vintage EX-era holos maintain collector interest but lack explosive modern hype.",
  "why_price": "Moderate supply from 2003 EX Dragon set; demand driven by nostalgia for early 2000s Pokémon TCG and E-Reader compatibility. Population reports show PSA 9 ~159, PSA 10 rarer. Not a tier-1 chase card like some ex or full arts, leading to steady but not skyrocketing values. Recent sales reflect realistic play/collector wear.",
  "data_limitations": "Detailed monthly price history for full 18 months is limited in public sources (requires subscriptions for precise charts). The last_18_months array uses interpolated averages from observed sales trends and snapshots. Historic ranges are estimates. PSA 10 sales infrequent. Prices vary by condition, centering, and market channel. No invented data; blanks indicate insufficient recent sales.",
  "recommendations": {
    "collectors": "Strong pickup for completing EX Dragon sets or vintage Fighting-type collections. Prioritize NM or better raw for display; grade if centering is strong for long-term preservation and personal satisfaction.",
    "investors": "Stable hold rather than high-growth flip. Expect modest appreciation tied to overall vintage Pokémon market. Better for diversified vintage portfolios than speculative short-term gains. Monitor broader TCG trends; low volume in high grades limits liquidity."
  }
}`
