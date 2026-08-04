import React, { useState } from 'react';
import { PokemonCardView } from '../pokemonCardView/PokemonCardView';
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
            <PokemonCardView key={card.id} card={card} />
          ))}
        </div>
      
    </div>
  );
};
