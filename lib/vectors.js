// Embeddings and the vector store.
//
// Local embedding (default, no key): a hashed TF-IDF vector. Words are
// normalised, stop words dropped, unigrams and bigrams hashed into 1024
// dimensions, weighted by (1 + log tf) * idf, and L2-normalised so cosine
// similarity is a dot product. It is lexical: it matches words, not meaning,
// so "Dubai" will not find "UAE". The evaluation tab shows exactly where that
// costs recall.
//
// OpenAI embedding (when OPENAI_API_KEY is set): text-embedding-3-small,
// which is semantic. Same store, same search.

const DIM = 16384;
const STOP = new Set("a an and are as at be but by can do does for from has have how i if in into is it its of on or our so that the their them then there these they this to up was we what when where which who why will with within without you your".split(" "));

export function tokens(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

// Deliberately light stemmer: enough to join "discounts"/"discount" and "routed"/"routing".
export function stem(w) {
  if (w.length <= 4) return w;
  return w.replace(/(ingly|edly|ing|ed|ies|es|s|ly)$/, (m) => (m === "ies" ? "y" : "")) || w;
}

function features(text) {
  const t = tokens(text);
  const feats = [...t];
  for (let i = 0; i + 1 < t.length; i++) feats.push(`${t[i]}_${t[i + 1]}`);
  return feats;
}

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function buildIdf(texts) {
  const df = new Map();
  texts.forEach((t) => new Set(features(t)).forEach((f) => df.set(f, (df.get(f) || 0) + 1)));
  const n = texts.length;
  return { n, df, weight: (f) => Math.log((n + 1) / ((df.get(f) || 0) + 1)) + 1 };
}

export function localEmbed(text, idf) {
  const v = new Float32Array(DIM);
  const tf = new Map();
  features(text).forEach((f) => tf.set(f, (tf.get(f) || 0) + 1));
  for (const [f, count] of tf) {
    const h = fnv1a(f);
    const sign = h & 1 ? 1 : -1; // signed hashing reduces collision bias
    v[h % DIM] += sign * (1 + Math.log(count)) * idf.weight(f);
  }
  return normalise(v);
}

export function normalise(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export async function openaiEmbed(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts })
  });
  if (!res.ok) throw new Error(`embeddings API returned HTTP ${res.status}`);
  const data = await res.json();
  return data.data.sort((a, b) => a.index - b.index).map((d) => normalise(Float32Array.from(d.embedding)));
}

/**
 * Flat in-memory index. Brute-force cosine is exact and fast at this size
 * (tens to a few thousand chunks). Past ~100k vectors you would move to an
 * approximate index such as HNSW, e.g. pgvector with an hnsw index.
 */
export class VectorStore {
  constructor() { this.items = []; }
  add(vector, meta) { this.items.push({ vector, meta }); }
  get size() { return this.items.length; }

  search(query, k = 4) {
    return this.items.map((it) => ({ ...it, score: dot(query, it.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  // Maximal marginal relevance: trade a little relevance for less redundancy,
  // so overlapping chunks from the same passage do not fill every slot.
  searchMmr(query, k = 4, { lambda = 0.7, pool = 12 } = {}) {
    const candidates = this.search(query, Math.max(pool, k));
    const picked = [];
    while (picked.length < k && candidates.length) {
      let best = 0, bestVal = -Infinity;
      candidates.forEach((c, i) => {
        const redundancy = picked.length ? Math.max(...picked.map((p) => dot(p.vector, c.vector))) : 0;
        const val = lambda * c.score - (1 - lambda) * redundancy;
        if (val > bestVal) { bestVal = val; best = i; }
      });
      picked.push(candidates.splice(best, 1)[0]);
    }
    return picked;
  }
}
