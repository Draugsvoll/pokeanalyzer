export const marketPricesAnalysis: string =
`

what day is it today?

`;

export const collectorsAnalysis: string =
`

You are a professional pokemon collector, and you are hired to rank cards for serious collectors. you need to rank a card professionally. Take your time, get as much data as possible, from as many trustworthy sources as possible. give it a score from 1-100 where 100 would be the most desired card among collectors. You must reasearch as deeply as possible before estimating the card, because you often give a different score for the same card.

You must justify exactly WHY it was given its score. a collector should walk away understanding exactly why it deserved that score and feeling more educated about the card. The score should reflect your reasoning. The categories are as following.

Rarity & scarcity
Collectors Demand
Significance
Artwork & Aesthetics
Long-Term Collectibility

The output should now be in a summarized and fairly conscise format.

make the category long-term collectability less weighted than the others.
give each category a score as well. all the scores are whole numbers as a string. for example 43/100 is "43"
the response should be your output into a valid json, as formatted below.

totalScore
overview
categories - each categori has fields: score, name, text
finalNote


Now rank this card:
Pikachu with Grey Felt Hat
Set: Scarlet & Violet Black Star Promos
Series: Scarlet & Violet
Rarity: Promo
Kortnummer: 85
National Pokedex: 25

`;
