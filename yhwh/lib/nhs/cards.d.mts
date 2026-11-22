export interface Card {
  schema: 'nhs.card/v1';
  id: string;
  track: 'east' | 'west';
  grade: number;
  order: number;
  glyph: string;
  image: string;
  kind: string;
  prompt: string;
  answer: string;
  aliases: string[];
  hint: string;
  mnemonic: string;
  body: string;
  source: string;
  edition: string;
  rtk?: number;
}
export function parseMarkdown(text: string, filename?: string, shapes?: Record<string, string>): Card[];
