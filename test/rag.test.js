import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedChunks, structureChunks } from "../lib/chunk.js";
import { VectorStore, normalise, dot } from "../lib/vectors.js";
import { answer, evaluate, retrieve, extractiveAnswer } from "../lib/rag.js";
import { DOCS } from "../data/playbook.js";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

test("fixed chunks overlap by the requested number of words and cover the whole document", () => {
  const doc = DOCS[0];
  const chunks = fixedChunks(doc, { size: 50, overlap: 10 });
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1).end, doc.text.trimEnd().length);
  for (let i = 1; i < chunks.length; i++) {
    const shared = doc.text.slice(chunks[i].start, chunks[i - 1].end).split(/\s+/).filter(Boolean).length;
    assert.equal(shared, 10);
  }
});

test("structure chunks never cross a section heading", () => {
  for (const doc of DOCS) {
    for (const c of structureChunks(doc, { size: 60 })) {
      assert.ok(!/^##\s/m.test(c.text), `chunk ${c.id} contains a heading`);
      assert.ok(c.headings.length <= 1);
    }
  }
});

test("MMR avoids picking a near-duplicate of an already chosen result", () => {
  const store = new VectorStore();
  const v = (...xs) => normalise(Float32Array.from(xs));
  store.add(v(1, 0, 0), { id: "a" });
  store.add(v(0.99, 0.01, 0), { id: "a-duplicate" });
  store.add(v(0.7, 0.7, 0), { id: "b" });
  const q = v(1, 0.2, 0);
  assert.deepEqual(store.search(q, 2).map((h) => h.meta.id).sort(), ["a", "a-duplicate"]);
  const mmr = store.searchMmr(q, 2, { lambda: 0.5 }).map((h) => h.meta.id);
  assert.ok(mmr.includes("b"), `MMR picked ${mmr}`);
  assert.ok(Math.abs(dot(q, q) - 1) < 1e-6);
});

test("answers an in-scope question with a citation, extractively when there is no key", async () => {
  const out = await answer("Who can approve a 15 percent discount?", { strategy: "structure", topK: 3 });
  assert.equal(out.guard.passed, true);
  assert.equal(out.answer.mode, "extractive");
  assert.match(out.answer.text, /sales manager/i);
  assert.ok(out.answer.citations.length >= 1);
});

test("refuses off-topic questions instead of guessing", async () => {
  for (const q of ["What is the capital of France?", "Explain quantum computing", "How do I bake sourdough bread?", "What is the weather in Delhi?"]) {
    for (const strategy of ["fixed", "structure"]) {
      const out = await answer(q, { strategy });
      assert.equal(out.answer.mode, "refused", `${strategy}: "${q}" was answered (top score ${out.guard.topScore})`);
    }
  }
});

test("every evaluation question passes the relevance guard", async () => {
  const { EVAL_SET } = await import("../data/playbook.js");
  for (const item of EVAL_SET) {
    const r = await retrieve(item.q, { strategy: "structure", topK: 3 });
    assert.ok(r.guard.passed, `"${item.q}" was blocked (score ${r.guard.topScore})`);
  }
});

test("evaluation reports hit@k and MRR for both strategies", async () => {
  const out = await evaluate({ topK: 3, size: 80, overlap: 20 });
  assert.deepEqual(out.runs.map((r) => r.strategy), ["fixed", "structure"]);
  for (const r of out.runs) {
    assert.equal(r.total, 12);
    assert.ok(r.hitAtK >= 9, `${r.strategy} hit@3 dropped to ${r.hitAtK}`);
    assert.ok(r.mrr > 0 && r.mrr <= 1);
  }
});

test("extractive answer returns null when nothing overlaps", () => {
  assert.equal(extractiveAnswer("zebra", [{ rank: 1, text: "Discounts need approval." }]), null);
});

test("known limitation: a shared everyday word gets past the lexical guard", async () => {
  // "won" ("closed won") and "match" ("matches our ideal customer profile")
  // both appear in the playbook, so lexical matching sees overlap and lets
  // this through. Semantic embeddings with a score threshold fix it; see
  // README, "What I would improve next".
  const r = await retrieve("Who won the cricket match yesterday?", { strategy: "fixed" });
  assert.equal(r.guard.passed, true);
  assert.ok(r.guard.sharedTerms.includes("match"));
});
