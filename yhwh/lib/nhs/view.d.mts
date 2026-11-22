import type { Card } from './cards.mjs';
export function mountNHS(container: HTMLElement, options?: {
  cards?: Card[];
  close?: () => void;
  reload?: () => Promise<Card[]>;
  onResult?: (result: { correct: boolean }, card: Card) => void;
  source?: string;
}): { setCards(cards: Card[]): void; destroy(): void };
