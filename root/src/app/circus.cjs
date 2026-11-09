const ORIGIN = "https://nietzschefamilycircus.com";

function decode(text) {
  return text.replace(/<[^>]*>/g, "").replace(/&(?:amp|quot|apos|lt|gt|#39|#\d+|#x[\da-f]+);/gi, entity => {
    const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" };
    if (named[entity]) return named[entity];
    const number = entity.startsWith("&#x") ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  }).trim();
}

function parsePair(html) {
  const image = html.match(/class="comic"[^>]*>\s*<img[^>]+src="(\/img\/\d+\.(?:gif|png|jpg))"/i)?.[1];
  const quote = html.match(/class="quote"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const link = html.match(/href="(\/perm\.php\?c=\d+(?:&amp;|&)q=\d+)"/i)?.[1];
  if (!image || !quote || !link) throw new Error("The Circus changed its page format. Open the original site or try again.");
  return { image, quote: decode(quote), permalink: ORIGIN + decode(link) };
}

async function nextPair(fetcher = fetch) {
  // The site's PHP chooses the cartoon and quote independently. Use that same
  // pairing and permalink, without embedding its advertisements or scripts.
  const response = await fetcher(`${ORIGIN}/?thwh=${Date.now()}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Circus is unavailable (${response.status}). Try Next again.`);
  const pair = parsePair(await response.text());
  const asset = await fetcher(ORIGIN + pair.image, { signal: AbortSignal.timeout(12000) });
  if (!asset.ok) throw new Error("The cartoon could not be loaded. Try Next again.");
  const buffer = Buffer.from(await asset.arrayBuffer());
  if (buffer.length > 3_000_000) throw new Error("The cartoon is too large.");
  const type = pair.image.endsWith(".gif") ? "image/gif" : pair.image.endsWith(".png") ? "image/png" : "image/jpeg";
  return { ...pair, image: `data:${type};base64,${buffer.toString("base64")}` };
}
module.exports = { parsePair, nextPair };
