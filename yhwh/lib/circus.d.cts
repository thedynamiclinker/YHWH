export type CircusPair = { image: string; quote: string; permalink: string | null };
export const ORIGIN: string;
export function parsePair(html: string): CircusPair;
