const $ = (s) => document.querySelector(s);

const SAMPLES = [
  "Who can approve a 15 percent discount?",
  "How quickly must we reply to an urgent demo request?",
  "What makes a lead an MQL?",
  "Can we give a discount on implementation services?",
  "Do we share our SOC 2 report?",
  "Where do leads from Dubai get routed?",
  "What is the capital of France?"
];

let lastResult = null;
let docs = [];

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  kids.flat().forEach((k) => k != null && n.append(k));
  return n;
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return data;
}

function settings() {
  const f = $("#settings");
  const val = (name) => f.querySelector(`[name=${name}]`);
  return {
    strategy: f.querySelector("[name=strategy]:checked").value,
    size: Number(val("size").value),
    overlap: Number(val("overlap").value),
    topK: Number(val("topK").value),
    mmr: val("mmr").checked
  };
}

// Same light stemmer as the server, so highlights line up with what matched.
const stem = (w) => (w.length <= 4 ? w : w.replace(/(ingly|edly|ing|ed|ies|es|s|ly)$/, (m) => (m === "ies" ? "y" : "")) || w);

function highlighted(text, stems) {
  const frag = document.createDocumentFragment();
  const set = new Set(stems);
  text.split(/(\b[A-Za-z0-9]+\b)/).forEach((part) => {
    if (/^[A-Za-z0-9]+$/.test(part) && set.has(stem(part.toLowerCase()))) frag.append(el("mark", { text: part }));
    else frag.append(part);
  });
  return frag;
}

/* ---------------- Ask ---------------- */
async function ask(question) {
  if (!question.trim()) return;
  $("#askBtn").disabled = true;
  try {
    const out = await api("/api/ask", { question, settings: settings() });
    lastResult = out;
    renderAnswer(out);
    renderPassages(out);
    const topDoc = out.retrieved[0]?.doc;
    if (topDoc && $("#docSel").value !== topDoc) $("#docSel").value = topDoc;
    await renderDoc();
  } catch (e) {
    $("#answer").className = "answer refused";
    $("#answer").replaceChildren(el("p", { class: "kind", text: "The question could not be answered" }), el("p", { class: "text", text: e.message }));
  } finally {
    $("#askBtn").disabled = false;
  }
}

function renderAnswer(out) {
  const box = $("#answer");
  const a = out.answer;
  box.className = `answer ${a.mode === "refused" ? "refused" : ""}`;
  const kind = {
    generated: "Written by Claude using only the passages below",
    extractive: "Sentences quoted from the passages below (no model key on this deployment)",
    refused: "Not answered"
  }[a.mode];
  const text = el("p", { class: "text" });
  a.text.split(/(\[\d\])/).forEach((part) => {
    const m = part.match(/^\[(\d)\]$/);
    if (m) {
      const link = el("a", { class: "cite", href: `#passage-${m[1]}`, text: `[${m[1]}]`, "aria-label": `Passage ${m[1]}` });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const p = $(`#passage-${m[1]}`);
        p?.scrollIntoView({ behavior: "smooth", block: "center" });
        p?.classList.add("flash");
        setTimeout(() => p?.classList.remove("flash"), 1400);
      });
      text.append(link);
    } else text.append(part);
  });
  const g = out.guard;
  const guard = el("p", { class: "guard", text: g.passed
    ? `Best passage scored ${g.topScore} (threshold ${g.threshold}) and shares ${g.sharedTerms.length ? `"${g.sharedTerms.slice(0, 4).join('", "')}"` : "no words"} with the question.`
    : `Best passage scored ${g.topScore} against a threshold of ${g.threshold}${g.sharedTerms && !g.sharedTerms.length ? " and shares no meaningful words with the question" : ""}, so nothing was generated.` });
  box.replaceChildren(el("p", { class: "kind", text: kind }), text, guard);
}

function renderPassages(out) {
  const list = $("#passageList");
  list.textContent = "";
  const max = Math.max(0.35, ...out.retrieved.map((r) => r.score));
  out.retrieved.forEach((r) => {
    const pct = Math.max(2, Math.round((r.score / max) * 100));
    const li = el("li", { class: "passage", id: `passage-${r.rank}` },
      el("div", { class: "p-head" },
        el("span", { class: "rank", text: `[${r.rank}]` }),
        el("span", { class: "where", text: `${r.docTitle}${r.headings.length ? ` › ${r.headings.join(", ")}` : ""}` }),
        el("span", { class: "score" }, el("span", { class: "bar", "aria-hidden": "true" }, el("span", { style: `width:${pct}%` })), `${r.score.toFixed(3)}`)
      ),
      el("p", { class: "p-text" }, highlighted(r.text.replace(/^#+\s*/gm, ""), out.guard.sharedTerms || []))
    );
    list.append(li);
  });
  const t = out.timings;
  $("#timing").textContent = `Searched ${out.index.chunks} chunks with ${out.index.embedding === "local" ? "local" : "OpenAI"} embeddings. Query embedded in ${t.embedMs} ms, search took ${t.searchMs} ms${t.generateMs != null ? `, answer in ${t.generateMs} ms` : ""}.${out.index.note ? ` ${out.index.note}.` : ""}`;
  $("#passages").hidden = false;
}

/* ---------------- Chunk viewer ---------------- */
async function renderDoc() {
  const s = settings();
  const docId = $("#docSel").value;
  const { doc, chunks } = await api("/api/chunks", { doc: docId, settings: s });
  const hits = new Map((lastResult?.retrieved || []).filter((r) => r.doc === doc.id).map((r) => [r.id, r.rank]));
  // a chunk id encodes the settings it was made with; only mark hits from a result with the same settings
  const sameSettings = lastResult && JSON.stringify(lastResult.settings) === JSON.stringify({ ...s, overlap: s.overlap });

  const points = new Set([0, doc.text.length]);
  chunks.forEach((c) => { points.add(c.start); points.add(c.end); });
  const sorted = [...points].sort((a, b) => a - b);
  const view = $("#docView");
  view.textContent = "";
  const tagged = new Set();

  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const covering = chunks.map((c, idx) => ({ c, idx })).filter(({ c }) => c.start < b && c.end > a);
    const span = el("span");
    if (covering.length === 1) span.className = covering[0].idx % 2 ? "seg-b" : "seg-a";
    if (covering.length > 1) span.className = "seg-o";
    const hit = sameSettings ? covering.find(({ c }) => hits.has(c.id)) : null;
    if (hit) {
      span.classList.add("seg-hit");
      if (!tagged.has(hit.c.id)) { span.append(el("span", { class: "tag", text: `[${hits.get(hit.c.id)}]` })); tagged.add(hit.c.id); }
    }
    doc.text.slice(a, b).split(/(^#{1,6} .*$)/m).forEach((part) => {
      if (/^#{1,6} /.test(part)) span.append(el("span", { class: "hd", text: part.replace(/^#+\s*/, "") }));
      else span.append(part);
    });
    view.append(span);
  }
  $("#chunkCount").textContent = `${chunks.length} chunks in this document`;
}

/* ---------------- Evaluation ---------------- */
async function runEval() {
  const btn = $("#evalBtn");
  btn.disabled = true;
  btn.textContent = "Running…";
  try {
    const out = await api("/api/evaluate", { settings: settings() });
    const [fx, st] = out.runs;
    const bestHit = Math.max(fx.hitAtK, st.hitAtK), bestMrr = Math.max(fx.mrr, st.mrr);
    const name = { fixed: "Fixed window", structure: "By section" };
    const summary = el("table", {},
      el("thead", {}, el("tr", {}, el("th", { text: "Strategy" }), el("th", { text: "Chunks" }), el("th", { text: `Hit@${out.k}` }), el("th", { text: "MRR" }))),
      el("tbody", {}, out.runs.map((r) => el("tr", {},
        el("td", { text: name[r.strategy] }),
        el("td", { class: "num", text: String(r.chunks) }),
        el("td", { class: `num ${r.hitAtK === bestHit ? "best" : ""}`, text: `${r.hitAtK} / ${r.total}` }),
        el("td", { class: `num ${r.mrr === bestMrr ? "best" : ""}`, text: r.mrr.toFixed(3) })
      )))
    );
    const cell = (rank) => el("td", { class: `num ${rank ? "" : "miss"}`, text: rank ? `#${rank}` : "missed" });
    const per = el("details", { class: "perq" }, el("summary", { text: "Question by question" }),
      el("div", { class: "table-wrap" }, el("table", {},
        el("thead", {}, el("tr", {}, el("th", { text: "Question" }), el("th", { text: "Fixed" }), el("th", { text: "Section" }))),
        el("tbody", {}, fx.perQuestion.map((p, i) => el("tr", {}, el("td", { text: p.q }), cell(p.rank), cell(st.perQuestion[i].rank))))
      ))
    );
    const note = el("p", { class: "hint", text: `Settings: ${out.size}-word chunks, ${out.overlap}-word overlap for the fixed window, top ${out.k}, MMR ${out.mmr ? "on" : "off"}, ${out.embedding} embeddings. Misses are usually paraphrases, such as "Dubai" for "the GCC", which word-matching embeddings cannot connect.` });
    $("#evalOut").replaceChildren(el("div", { class: "table-wrap" }, summary), per, note);
  } catch (e) {
    $("#evalOut").replaceChildren(el("p", { class: "miss", text: e.message }));
  } finally {
    btn.disabled = false;
    btn.textContent = "Run evaluation";
  }
}

/* ---------------- Wiring ---------------- */
function syncOutputs() {
  const f = $("#settings");
  for (const n of ["size", "overlap", "topK"]) $(`#${n}Out`).textContent = f.querySelector(`[name=${n}]`).value;
  const fixed = settings().strategy === "fixed";
  $("#overlapLabel").classList.toggle("disabled", !fixed);
  f.querySelector("[name=overlap]").disabled = !fixed;
}

let settleTimer;
function onSettingsChange() {
  syncOutputs();
  clearTimeout(settleTimer);
  settleTimer = setTimeout(async () => {
    const q = $("#q").value.trim();
    if (q && lastResult) await ask(q); else await renderDoc();
  }, 250);
}

async function init() {
  SAMPLES.forEach((q) => {
    const b = el("button", { type: "button", text: q });
    b.addEventListener("click", () => { $("#q").value = q; ask(q); });
    $("#samples").append(b);
  });
  $("#askForm").addEventListener("submit", (e) => { e.preventDefault(); ask($("#q").value); });
  $("#settings").addEventListener("input", onSettingsChange);
  $("#evalBtn").addEventListener("click", runEval);
  document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll('[role="tab"]').forEach((t) => { t.setAttribute("aria-selected", String(t === tab)); $(`#${t.getAttribute("aria-controls")}`).hidden = t !== tab; });
  }));
  syncOutputs();
  try {
    const info = await api("/api/chunks");
    docs = info.docs;
    docs.forEach((d) => $("#docSel").append(el("option", { value: d.id, text: d.title })));
    $("#docSel").addEventListener("change", renderDoc);
    $("#modes").append(el("span", { class: "mode" }, "Answers: ", el("b", { text: info.mode.generation })), el("span", { class: "mode" }, "Embeddings: ", el("b", { text: info.mode.embedding })));
    await renderDoc();
  } catch (e) {
    $("#answer").replaceChildren(el("p", { class: "empty", text: `The API is not reachable: ${e.message}. Run npm run dev and open http://localhost:3000.` }));
  }
}
init();
