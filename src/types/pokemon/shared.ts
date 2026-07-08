export type EnergyType =
  | "Colorless"
  | "Fire"
  | "Water"
  | "Grass"
  | "Lightning"
  | "Psychic"
  | "Fighting"
  | "Darkness"
  | "Metal"
  | "Dragon"
  | "Fairy";

export type TypeEffect = {
  type: string;
  value: string;
};

export type Legalities = {
  unlimited: string;
  standard?: string;
  expanded?: string;
};