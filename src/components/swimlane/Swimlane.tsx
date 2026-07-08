import React, { useState } from 'react';
import { PokemonCard } from '../pokemonCard/PokemonCard';
import type { PokemonCard as PokemonCardType } from '../../types/pokemon';
import pokemonCards from '../../data/pokemon-cards.json';
import './Swimlane.scss';

export const Swimlane: React.FC = () => {
  const [cards] = useState<PokemonCardType[]>(pokemonCards);

  return (
    <div className="swimlane-container">
        <h2>Swimlane ({cards.length})</h2>
  
        <div className="swimlane">
          {cards.map(card => (
            <PokemonCard key={card.id} card={card}/>
          ))}
        </div>
      
    </div>
  );
};