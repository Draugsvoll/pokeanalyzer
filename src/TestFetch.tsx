import { useEffect, useState } from 'react';

const JUSTTCG_API_KEY = import.meta.env.VITE_JUSTTCG_API_KEY;
const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';

type JustTcgVariant = {
  id: string;
  condition: string;
  printing: string;
  price: number;
  priceChange7d?: number | null;
};

type JustTcgCard = {
  id: string;
  name: string;
  game: string;
  set: string;
  set_name?: string;
  number: string | null;
  rarity: string | null;
  tcgplayerId: string | null;
  variants: JustTcgVariant[];
};

type JustTcgCardsResponse = {
  data: JustTcgCard[];
  usage?: {
    apiDailyRequestsRemaining?: number;
  };
  error?: string;
};

type LookupType = 'cardId' | 'tcgplayerId' | 'name';

const EXAMPLE_CARDS: Array<{ label: string; lookup: Record<string, string> }> = [
  // {
  //   label: 'Charizard (Base Set Shadowless)',
  //   lookup: { cardId: 'pokemon-base-set-shadowless-charizard-holo-rare' },
  // },
  {
    label: 'Pikachu',
    lookup: { q: 'Pikachu', number: '1' },
  },
];

async function fetchIndividualCard(
  lookup: Record<string, string>
): Promise<JustTcgCardsResponse> {
  if (!JUSTTCG_API_KEY) {
    throw new Error('VITE_JUSTTCG_API_KEY is not configured in .env');
  }

  const url = new URL(`${JUSTTCG_BASE_URL}/cards`);
  url.searchParams.set('game', 'pokemon');

  for (const [key, value] of Object.entries(lookup)) {
    if (value.trim()) {
      url.searchParams.set(key, value.trim());
    }
  }

  const response = await fetch(url, {
    headers: { 'x-api-key': JUSTTCG_API_KEY },
  });

  const data = (await response.json()) as JustTcgCardsResponse;

  if (!response.ok) {
    throw new Error(data.error ?? `JustTCG request failed (${response.status})`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

const Fetch: React.FC = () => {
  const [cards, setCards] = useState<JustTcgCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestsRemaining, setRequestsRemaining] = useState<number | null>(null);
  const [lookupType, setLookupType] = useState<LookupType>('cardId');
  const [lookupValue, setLookupValue] = useState('');

  const runLookup = async (lookup: Record<string, string>) => {
    try {
      setLoading(true);
      setError(null);

      const data = await fetchIndividualCard(lookup);

      setCards(data.data);
      setRequestsRemaining(data.usage?.apiDailyRequestsRemaining ?? null);
    } catch (err) {
      setCards([]);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runLookup(EXAMPLE_CARDS[0].lookup);
  }, []);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = lookupValue.trim();
    if (!trimmed) return;

    const lookup: Record<string, string> = {};

    if (lookupType === 'cardId') {
      lookup.cardId = trimmed;
    } else if (lookupType === 'tcgplayerId') {
      lookup.tcgplayerId = trimmed;
    } else {
      lookup.q = trimmed;
    }

    runLookup(lookup);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-2">JustTCG Individual Card Lookup</h1>
      {requestsRemaining !== null && (
        <p className="text-sm text-gray-500 mb-4">
          API requests remaining today: {requestsRemaining}
        </p>
      )}

      <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-4">
        <select
          value={lookupType}
          onChange={(e) => setLookupType(e.target.value as LookupType)}
          className="border rounded px-3 py-2"
        >
          <option value="cardId">JustTCG cardId</option>
          <option value="tcgplayerId">TCGplayer ID</option>
          <option value="name">Card name</option>
        </select>

        <input
          type="text"
          value={lookupValue}
          onChange={(e) => setLookupValue(e.target.value)}
          placeholder={
            lookupType === 'cardId'
              ? 'pokemon-base-set-shadowless-charizard-holo-rare'
              : lookupType === 'tcgplayerId'
                ? '106999'
                : 'Charizard'
          }
          className="border rounded px-3 py-2 flex-1 min-w-[200px]"
        />

        <button
          type="submit"
          disabled={loading || !lookupValue.trim()}
          className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {loading ? 'Fetching...' : 'Fetch card'}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-8">
        {EXAMPLE_CARDS.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => runLookup(example.lookup)}
            disabled={loading}
            className="border rounded px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            {example.label}
          </button>
        ))}
      </div>

      {error && <div className="text-red-600 mb-4">Error: {error}</div>}
      {loading && <div>Loading...</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cards.map((card) => (
          <div key={card.id} className="bg-white rounded-lg shadow-md p-4">
            <h3 className="text-xl font-semibold mb-1">{card.name}</h3>
            <p className="text-sm text-gray-500 mb-3">{card.id}</p>
            <p><strong>Set:</strong> {card.set_name ?? card.set}</p>
            {card.number && <p><strong>Number:</strong> {card.number}</p>}
            <p><strong>Rarity:</strong> {card.rarity ?? 'N/A'}</p>
            {card.tcgplayerId && (
              <p><strong>TCGplayer ID:</strong> {card.tcgplayerId}</p>
            )}

            <h4 className="font-semibold mt-4 mb-2">Variants</h4>
            <ul className="space-y-2">
              {card.variants.map((variant) => (
                <li
                  key={variant.id}
                  className="flex justify-between text-sm border-b pb-1"
                >
                  <span>
                    {variant.condition} · {variant.printing}
                  </span>
                  <span className="text-green-600 font-medium">
                    ${variant.price.toFixed(2)}
                    {variant.priceChange7d != null && (
                      <span className="text-gray-500 ml-1">
                        ({variant.priceChange7d > 0 ? '+' : ''}
                        {variant.priceChange7d.toFixed(1)}% 7d)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {!loading && !error && cards.length === 0 && (
        <p>No cards found. Try a different lookup.</p>
      )}
    </div>
  );
};

export default Fetch;
