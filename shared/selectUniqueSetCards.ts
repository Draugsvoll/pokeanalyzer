type SetCardIdentity = {
  id: string;
  number?: string;
};

function cardIdentity(card: SetCardIdentity) {
  const number = card.number?.trim().toLocaleLowerCase("en-US");
  return number ? `number:${number}` : `id:${card.id}`;
}

export function selectUniqueSetCardsByPrice<TCard extends SetCardIdentity>(
  cards: readonly TCard[],
  getPrice: (card: TCard) => number | null,
) {
  const selectedByIdentity = new Map<
    string,
    { card: TCard; price: number | null }
  >();

  for (const card of cards) {
    const identity = cardIdentity(card);
    const price = getPrice(card);
    const selected = selectedByIdentity.get(identity);

    if (
      !selected ||
      (price !== null && (selected.price === null || price < selected.price))
    ) {
      selectedByIdentity.set(identity, { card, price });
    }
  }

  return [...selectedByIdentity.values()].map(({ card }) => card);
}
