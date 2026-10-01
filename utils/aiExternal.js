const TINYFISH_KEY = process.env.TINYFISH_API_KEY || "";
const KLIPY_KEY = process.env.KLIPY_API_KEY || "";

async function webSearch(query) {
  if (!TINYFISH_KEY) return null;

  const value = String(query || "").trim().slice(0, 500);
  if (!value) return null;

  try {
    const params = new URLSearchParams({
      query: value,
      location: "IN",
      language: "en"
    });

    const response = await fetch(
      "https://api.search.tinyfish.ai?" + params.toString(),
      {
        headers: {
          "X-API-Key": TINYFISH_KEY
        },
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!response.ok) return null;

    const body = await response.json().catch(() => ({}));
    const results = Array.isArray(body?.results)
      ? body.results
      : [];

    if (!results.length) return null;

    return results
      .slice(0, 5)
      .map(item => {
        const title = String(item?.title || "Result").slice(0, 160);
        const snippet = String(item?.snippet || "").slice(0, 500);
        const url = String(item?.url || "").slice(0, 300);
        return title + ": " + snippet + (url ? " (" + url + ")" : "");
      })
      .join("\n");
  } catch {
    return null;
  }
}

async function searchGif(query) {
  if (!KLIPY_KEY) return null;

  const value = String(query || "")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

  if (!value) return null;

  try {
    const response = await fetch(
      "https://api.klipy.com/api/v1/" +
        encodeURIComponent(KLIPY_KEY) +
        "/gifs/search?q=" +
        encodeURIComponent(value) +
        "&per_page=8&content_filter=medium",
      {
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!response.ok) return null;

    const body = await response.json().catch(() => ({}));
    const items = body?.data?.data;

    if (!Array.isArray(items) || !items.length) {
      return null;
    }

    const pick =
      items[
        Math.floor(
          Math.random() *
          Math.min(5, items.length)
        )
      ];

    if (!pick?.slug) return null;

    return "https://klipy.com/gifs/" + pick.slug;
  } catch {
    return null;
  }
}

function parseGifUrl(text) {
  const value = String(text || "");

  const tenor = value.match(/tenor\.com\/view\/([\w-]+)/i);
  if (tenor) {
    return tenor[1]
      .replace(/-gif-\d+$/i, "")
      .replace(/-/g, " ");
  }

  const giphy = value.match(/giphy\.com\/gifs\/([\w-]+)/i);
  if (giphy) {
    const parts = giphy[1].split("-");
    if (parts.length > 1) parts.pop();
    return parts.join(" ");
  }

  const klipy = value.match(/klipy\.com\/gifs\/([\w-]+)/i);
  if (klipy) {
    return klipy[1]
      .replace(/--[\w]+$/i, "")
      .replace(/-/g, " ");
  }

  if (/static\.klipy\.com\/.+\.(gif|mp4|webp)/i.test(value)) {
    return "reaction gif";
  }

  return null;
}

module.exports = {
  webSearch,
  searchGif,
  parseGifUrl
};
