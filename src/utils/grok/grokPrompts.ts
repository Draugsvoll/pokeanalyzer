const marketPricesAnalysis: string =
`
what day is it today?
`;


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



const isWorthGradingAnalysisPrompt: string =
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
  const instructions = isWorthGradingAnalysisPrompt
    .split("Card to analyze:")[0]
    .trimEnd();

  return `${instructions}\n\nCard to analyze:\n${cardNameAndSet}`;
}

export function collectorsAnalysisPrompt(cardNameAndSet: string): string {
  const instructions = collectorsAnalysis.split("Now rank this card:")[0].trimEnd();
  return `${instructions}\n\nNow rank this card:\n${cardNameAndSet}`;
}
