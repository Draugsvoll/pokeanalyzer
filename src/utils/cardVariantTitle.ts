function titleIncludesCardName(title: string, cardName: string) {
  return title.toLowerCase().includes(cardName.toLowerCase());
}

export function formatCardVariantTitle(title: string, cardName: string) {
  const trimmedTitle = title.trim();
  const trimmedCardName = cardName.trim();

  if (!trimmedTitle || !trimmedCardName) return trimmedTitle;
  if (titleIncludesCardName(trimmedTitle, trimmedCardName)) return trimmedTitle;

  return `${trimmedCardName} (${trimmedTitle})`;
}
