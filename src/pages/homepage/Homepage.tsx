import { Frontpage } from '../../components/frontpage/Frontpage';
import { GridView } from '../../components/gridView/GridView';
import Listing from '../../components/listingCard/ListingCard'
import { useFetchListings } from '../../hooks/listings';
import { useEffect, useMemo, useState } from "react";
import { sortPokemonCards } from "../../utils/sorting/pokemonSorting";
import { sortListings } from "../../utils/sorting/listingSorting";
import './Homepage.scss'
import type { PokemonCard as PokemonCardType } from '../../types/pokemon';
import { PokemonCard } from '../../components/pokemonCard/PokemonCard'
import CardGrader from '../../components/cardGrader/CardGrader';

export default function Homepage() {
  // LISTINGS LIST LOGIC
  const {listings} = useFetchListings()
  const [listingSortBy, setListingSortBy] = useState<"newest" | "price-low" | "price-high">("newest");
  const sortedListings = useMemo(() => {
    return sortListings(
      listings,
      listingSortBy
    );
  }, [listings, listingSortBy]);



  if (false) {
    useEffect(() => {}, []);
    sortPokemonCards([], "newest");
    const card: PokemonCardType = {} as PokemonCardType;
    console.log(<PokemonCard key="unused" card={card} />);
  }

  return (
    <div className="page-container">
      <Frontpage />
      <CardGrader></CardGrader>
      {/* POKEMON DATABASE FETCH */}
      {/* <div className="pokemons-container">
        <h1>Pokemon database</h1>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as| "newest"| "price-low"| "price-high")}>
          <option value="newest">Newest</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
        </select>
        <GridView>
          {sortedPokemons.map(pokemon => (
            <PokemonCard
              key={pokemon.id}
              card={pokemon}
            />
          ))}
        </GridView>
      </div> */}

    {/* LISTINGS FETCH */}
    <div className="listings-container">
      <h1>Listings</h1>
      <select
        value={listingSortBy}
        onChange={(e) => setListingSortBy(e.target.value as| "newest"| "price-low"| "price-high")}>
        <option value="newest">Newest</option>
        <option value="price-low">Price: Low to High</option>
        <option value="price-high">Price: High to Low</option>
      </select>
      <GridView>
        {sortedListings.map(listing => (
          <Listing
            key={listing.id}
            listing={listing}
          />
        ))}
      </GridView>
    </div>

		{/* <Swimlane /> */}
    </div>
  );
}
