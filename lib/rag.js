import { DOCS, EVAL_SET } from "../data/playbook.js";
import { chunkDocs } from "./chunk.js";
import { VectorStore, buildIdf, localEmbed, openaiEmbed, tokens } from "./vectors.js";
import { complete, llmConfigured, LlmUnavailable } from "./llm.js";

// Relevance guard. With local (lexical) embeddings the best chunk must score
// above the threshold AND share at least one real word with the question;
// the second check removes matches caused only by hash collisions. With
// semantic embeddings only the score threshold applies, since a correct match
// may share no words ("Dubai" vs "UAE"). Calibrated in test/rag.test.js.
export const THRESHOLDS = { local: 0.02, openai: 0.3 };

export function normaliseSettings(s = {}) {
  return {
    strategy: s.strategy === "fixed" ? "fixed" : "structure",
    size: Math.max(30, Math.min(300, Number(s.size) || 80)),
    overlap: Math.max(0, Math.min(100, Number(s.overlap ?? 20))),
    topK: Math.max(1, Math.min(8, Number(s.topK) || 4)),
    mmr: s.mmr !== false
  };
}

const cache = new Map();

export async function getIndex(settings) {
  const embedding = process.env.OPENAI_API_KEY ? "openai" : "local";
  const key = `${embedding}:${settings.strategy}:${settings.size}:${settings.strategy === "fixed" ? settings.overlap : "-"}`;
  if (cache.has(key)) return cache.get(key);

  const started = Date.now();
  const chunks = chunkDocs(DOCS, settings);
  const store = new VectorStore();
  let idf = null;
  let used = embedding;
  let note = null;
  if (embedding === "openai") {
    try {
      const vectors = await openaiEmbed(chunks.map((c) => c.embedText));
      vectors.forEach((v, i) => store.add(v, chunks[i]));
    } catch (err) {
      used = "local";
      note = `OpenAI embeddings failed (${err.message}); fell back to local embeddings`;
    }
  }
  if (used === "local") {
    idf = buildIdf(chunks.map((c) => c.embedText));
    chunks.forEach((c) => store.add(localEmbed(c.embedText, idf), c));
  }
  const index = { key, store, idf, embedding: used, note, chunks, buildMs: Date.now() - started };
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  cache.set(key, index);
  return index;
}

async function embedQuery(index, q) {
  if (index.embedding === "openai") return (await openaiEmbed([q]))[0];
  return localEmbed(q, index.idf);
}

export async function retrieve(question, rawSettings) {
  const settings = normaliseSettings(rawSettings);
  const index = await getIndex(settings);
  const t0 = Date.now();
  const qv = await embedQuery(index, question);
  const t1 = Date.now();
  const hits = settings.mmr ? index.store.searchMmr(qv, settings.topK) : index.store.search(qv, settings.topK);
  const t2 = Date.now();
  const threshold = THRESHOLDS[index.embedding];
  const topScore = hits.length ? hits[0].score : 0;
  const qTerms = new Set(tokens(question));
  const sharedTerms = [...new Set(hits.flatMap((h) => tokens(h.meta.embedText)))].filter((w) => qTerms.has(w));
  const lexicalOk = index.embedding !== "local" || sharedTerms.length > 0;
  return {
    settings,
    index: { chunks: index.store.size, embedding: index.embedding, note: index.note, buildMs: index.buildMs },
    retrieved: hits.map((h, i) => ({ rank: i + 1, score: Number(h.score.toFixed(4)), ...pick(h.meta) })),
    guard: { passed: topScore >= threshold && lexicalOk, topScore: Number(topScore.toFixed(4)), threshold, sharedTerms },
    timings: { embedMs: t1 - t0, searchMs: t2 - t1 }
  };
}

const pick = ({ id, doc, docTitle, headings, start, end, text }) => ({ id, doc, docTitle, headings, start, end, text });

// Extractive fallback: choose the sentences that share the most query terms,
// keep them in reading order, and cite where each came from.
export function extractiveAnswer(question, retrieved) {
  const q = new Set(tokens(question));
  const sentences = [];
  retrieved.forEach((c, ci) => {
    c.text.replace(/^#+.*$/gm, "").split(/(?<=[.!?])\s+/).forEach((s, si) => {
      const t = s.trim();
      if (t.length < 20) return;
      const overlap = tokens(t).filter((w) => q.has(w)).length;
      if (overlap) sentences.push({ t, overlap: overlap + (ci === 0 ? 0.5 : 0), cite: c.rank, order: ci * 100 + si });
    });
  });
  const best = sentences.sort((a, b) => b.overlap - a.overlap).slice(0, 2).sort((a, b) => a.order - b.order);
  if (!best.length) return null;
  return best.map((s) => `${s.t} [${s.cite}]`).join(" ");
}

export async function answer(question, rawSettings) {
  question = String(question || "").trim().slice(0, 400);
  if (question.length < 3) throw new Error("Ask a question of at least three characters");
  const r = await retrieve(question, rawSettings);

  if (!r.guard.passed) {
    return { ...r, answer: { text: "The playbook does not cover this. No answer was generated, because the closest passage scored below the relevance threshold.", mode: "refused" } };
  }

  const t0 = Date.now();
  let result;
  try {
    if (!llmConfigured()) {
      const e = new LlmUnavailable("no ANTHROPIC_API_KEY set");
      throw e;
    }
    const context = r.retrieved.map((c) => `[${c.rank}] ${c.docTitle}${c.headings.length ? ` > ${c.headings.join(", ")}` : ""}\n${c.text}`).join("\n\n");
    const text = await complete({
      maxTokens: 400,
      system: "You answer questions for a sales team using only the numbered playbook passages provided. Cite passages like [1]. If the passages do not contain the answer, say so plainly. Never use outside knowledge.",
      prompt: `Passages:\n${context}\n\nQuestion: ${question}\n\nAnswer in at most 3 sentences.`
    });
    result = { text, mode: "generated" };
  } catch (err) {
    const text = extractiveAnswer(question, r.retrieved);
    result = text
      ? { text, mode: "extractive", note: err instanceof LlmUnavailable ? err.message : "model call failed" }
      : { text: "The retrieved passages do not contain a clear answer.", mode: "refused" };
  }
  return { ...r, answer: { ...result, citations: [...new Set([...result.text.matchAll(/\[(\d)\]/g)].map((m) => Number(m[1])))] }, timings: { ...r.timings, generateMs: Date.now() - t0 } };
}

export function isHit(chunk, expected) {
  return chunk.doc === expected.doc && chunk.headings.includes(expected.heading);
}

export async function evaluate(rawSettings) {
  const base = normaliseSettings(rawSettings);
  const runs = [];
  for (const strategy of ["fixed", "structure"]) {
    const settings = { ...base, strategy };
    const perQuestion = [];
    for (const item of EVAL_SET) {
      const r = await retrieve(item.q, settings);
      const rank = r.retrieved.findIndex((c) => isHit(c, item)) + 1;
      perQuestion.push({ q: item.q, expected: `${item.doc} > ${item.heading}`, rank: rank || null, topScore: r.guard.topScore });
    }
    const hits = perQuestion.filter((p) => p.rank).length;
    const mrr = perQuestion.reduce((s, p) => s + (p.rank ? 1 / p.rank : 0), 0) / perQuestion.length;
    const idx = await getIndex(settings);
    runs.push({ strategy, chunks: idx.store.size, hitAtK: hits, total: perQuestion.length, mrr: Number(mrr.toFixed(3)), perQuestion });
  }
  return { k: base.topK, size: base.size, overlap: base.overlap, mmr: base.mmr, embedding: process.env.OPENAI_API_KEY ? "openai" : "local", runs };
}

export function documents() {
  return DOCS.map(({ id, title, text }) => ({ id, title, text }));
}

export async function chunkMap(docId, rawSettings) {
  const settings = normaliseSettings(rawSettings);
  const doc = DOCS.find((d) => d.id === docId) || DOCS[0];
  const index = await getIndex(settings);
  return { doc: { id: doc.id, title: doc.title, text: doc.text }, chunks: index.chunks.filter((c) => c.doc === doc.id).map(({ id, start, end, headings }) => ({ id, start, end, headings })) };
}
