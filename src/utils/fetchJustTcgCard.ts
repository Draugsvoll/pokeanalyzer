const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function fetchJustTcgCard(
  name: string,
  number: string | number
) {
  const params = new URLSearchParams({
    name,
    number: String(number),
  });

  const response = await fetch(`${API_URL}/api/justtcg-card?${params}`);

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(error.message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

export function verifyJustTcgCard(
  result: unknown,
  name: string,
  setName: string,
  number: string | number
): unknown {
  if (!result || typeof result !== "object" || !("data" in result) || !Array.isArray(result.data)) {
    return result;
  }

  console.log("Original card set name:", setName);
  result.data.forEach((card) => {
    if (
      card !== null &&
      typeof card === "object" &&
      "set_name" in card
    ) {
      console.log("Fetched card set name:", card.set_name);
    }
  });

  const matchingCards = result.data.filter((card) => {
    if (
      card === null ||
      typeof card !== "object" ||
      !("name" in card) ||
      typeof card.name !== "string" ||
      !("set_name" in card) ||
      typeof card.set_name !== "string" ||
      !("number" in card) ||
      (typeof card.number !== "string" && typeof card.number !== "number")
    ) {
      return false;
    }

    const originalSetName = setName.trim().toLowerCase();
    const fetchedSetName = card.set_name.trim().toLowerCase();
    const setNamesMatch =
      originalSetName.includes(fetchedSetName) ||
      fetchedSetName.includes(originalSetName);
    const normalizeCardNumber = (value: string | number) => {
      const numberBeforeSlash = String(value).trim().split("/")[0];
      return numberBeforeSlash.replace(/^0+(?=\d)/, "");
    };
    const cardNumbersMatch =
      normalizeCardNumber(card.number) === normalizeCardNumber(number);

    return card.name.trim() === name.trim() && setNamesMatch && cardNumbersMatch;
  });

  return { ...result, data: matchingCards };
}
