const ORIGIN = "https://www.nietzschefamilycircus.com";

function decode(text) {
  return text.replace(/<[^>]*>/g, "").replace(/&(?:amp|quot|apos|lt|gt|#39|#\d+|#x[\da-f]+);/gi, entity => {
    const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" };
    if (named[entity]) return named[entity];
    const number = entity[2]?.toLowerCase() === "x" ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  }).trim();
}

function parsePair(html) {
  // PageSpeed can inject a script between the comic container and its image.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const image = html.match(/\sclass=["']comic["'][^>]*>\s*<img\b[^>]*\ssrc=["'](?:https?:\/\/(?:www\.)?nietzschefamilycircus\.com\/|\/?)(img\/\d+\.(?:gif|png|jpe?g))["']/i)?.[1];
  const quote = decode(html.match(/class=["']quote["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const link = html.match(/\shref=["'](?:https?:\/\/(?:www\.)?nietzschefamilycircus\.com\/|\/?)perm\.php\?c=(\d+)(?:&amp;|&)q=(\d+)["']/i);
  if (!image || !quote) throw new Error("The Circus changed its page format. Open the original site or try again.");
  return { image: "/" + image, quote, permalink: link ? ORIGIN + "/perm.php?c=" + link[1] + "&q=" + link[2] : null };
}

async function nextPair(fetcher = fetch) {
  // The site's PHP chooses the cartoon and quote independently. Use that same
  // pairing and permalink, without embedding its advertisements or scripts.
  const response = await fetcher(ORIGIN + "/", { signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!response.ok) throw new Error(`Circus is unavailable (${response.status}). Try Next again.`);
  const pair = parsePair(await response.text());
  const asset = await fetcher(ORIGIN + pair.image, { signal: AbortSignal.timeout(12000) });
  if (!asset.ok) throw new Error("The cartoon could not be loaded. Try Next again.");
  const buffer = Buffer.from(await asset.arrayBuffer());
  if (!buffer.length || buffer.length > 3_000_000) throw new Error("The cartoon could not be displayed.");
  return withCartoon(pair, buffer.toString("base64"));
}

function withCartoon(pair, encoded) {
  const image = pair.image.toLowerCase();
  const type = image.endsWith(".gif") ? "image/gif" : image.endsWith(".png") ? "image/png" : "image/jpeg";
  return { ...pair, image: `data:${type};base64,${encoded}` };
}

module.exports = { ORIGIN, parsePair, nextPair, withCartoon };
