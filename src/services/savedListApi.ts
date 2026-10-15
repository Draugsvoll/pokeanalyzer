import { authenticatedFetch } from "../utils/authenticatedFetch";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function savedListRequest<T>(
  list: "portfolio" | "watchlist",
  path: string,
  expectedUid: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await authenticatedFetch(
    `${API_URL}/api/${list}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    },
    expectedUid,
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      error.message || `Saved list request failed: ${response.status}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
