import primitives from '../../etc/nhs/curriculum/east-primitives.md';
import rtk from '../../etc/nhs/curriculum/east-rtk.md';
import letters from '../../etc/nhs/curriculum/west-letters.md';
import words from '../../etc/nhs/curriculum/west-words.md';
import grammar from '../../etc/nhs/curriculum/west-grammar.md';
import shapes from '../../etc/nhs/shapes.json';
import { parseMarkdown } from './cards.mjs';

export { shapes as builtinShapes };

let cards;
export function builtinCards() {
  return cards ??= [primitives, rtk, letters, words, grammar].flatMap(text => parseMarkdown(text, 'Bundled curriculum', shapes));
}
