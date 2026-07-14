const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function fetchJustTcgCard(name: string, number: string | number) {
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
