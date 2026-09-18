// Two chunking strategies, both returning chunks with character offsets into
// the original document so the UI can draw exactly where each chunk starts,
// ends and overlaps.
//
//  fixed      Sliding window of N words with O words of overlap. Simple and
//             predictable, but happily cuts a rule in half.
//  structure  Split on markdown headings first, then paragraphs, then
//             sentences, packing pieces up to N words. Each chunk carries its
//             heading path, which is prepended before embedding.

const WORD = /\S+/g;

function headingSpans(text) {
  const spans = [];
  const re = /^(#{1,6})\s+(.+)$/gm;
  let m;
  while ((m = re.exec(text))) spans.push({ level: m[1].length, title: m[2].trim(), start: m.index });
  return spans;
}

// Headings whose section overlaps [start, end), innermost level-2+ headings only.
function headingsFor(spans, start, end) {
  const sections = spans.filter((s) => s.level >= 2);
  const out = [];
  sections.forEach((s, i) => {
    const sEnd = i + 1 < sections.length ? sections[i + 1].start : Infinity;
    if (s.start < end && sEnd > start) out.push(s.title);
  });
  return out;
}

export function fixedChunks(doc, { size = 80, overlap = 20 } = {}) {
  size = Math.max(20, Math.min(400, size | 0));
  overlap = Math.max(0, Math.min(size - 10, overlap | 0));
  const words = [...doc.text.matchAll(WORD)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
  const spans = headingSpans(doc.text);
  const chunks = [];
  const step = size - overlap;
  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + size);
    const start = slice[0].start, end = slice[slice.length - 1].end;
    chunks.push(makeChunk(doc, chunks.length, start, end, headingsFor(spans, start, end), "fixed"));
    if (i + size >= words.length) break;
  }
  return chunks;
}

export function structureChunks(doc, { size = 80 } = {}) {
  size = Math.max(20, Math.min(400, size | 0));
  const text = doc.text;
  const spans = headingSpans(text);
  const sections = spans.filter((s) => s.level >= 2);
  const chunks = [];
  const countWords = (s) => (s.match(WORD) || []).length;

  // Intro text before the first section belongs to the document title.
  const bounds = [];
  const firstSection = sections.length ? sections[0].start : text.length;
  const titleEnd = spans.length && spans[0].level === 1 ? text.indexOf("\n", spans[0].start) + 1 : 0;
  if (firstSection > titleEnd && text.slice(titleEnd, firstSection).trim()) bounds.push({ title: null, start: titleEnd, end: firstSection });
  sections.forEach((s, i) => bounds.push({ title: s.title, start: text.indexOf("\n", s.start) + 1, end: i + 1 < sections.length ? sections[i + 1].start : text.length }));

  for (const b of bounds) {
    // paragraphs with offsets
    const pieces = [];
    const paraRe = /[^\n]+(?:\n(?!\n)[^\n]+)*/g;
    const body = text.slice(b.start, b.end);
    let m;
    while ((m = paraRe.exec(body))) {
      const pStart = b.start + m.index, pEnd = pStart + m[0].length;
      if (countWords(m[0]) <= size) { pieces.push({ start: pStart, end: pEnd, words: countWords(m[0]) }); continue; }
      // oversize paragraph: fall back to sentences
      const sentRe = /[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g;
      let sm;
      while ((sm = sentRe.exec(m[0]))) {
        const t = sm[0].trimEnd();
        if (!t.trim()) continue;
        pieces.push({ start: pStart + sm.index, end: pStart + sm.index + t.length, words: countWords(t) });
      }
    }
    // pack pieces up to size words
    let cur = null;
    for (const p of pieces) {
      if (cur && cur.words + p.words > size) { chunks.push(makeChunk(doc, chunks.length, cur.start, cur.end, b.title ? [b.title] : [], "structure")); cur = null; }
      cur = cur ? { start: cur.start, end: p.end, words: cur.words + p.words } : { ...p };
    }
    if (cur) chunks.push(makeChunk(doc, chunks.length, cur.start, cur.end, b.title ? [b.title] : [], "structure"));
  }
  return chunks;
}

function makeChunk(doc, index, start, end, headings, strategy) {
  const text = doc.text.slice(start, end).trim();
  const context = [doc.title, ...headings].join(" > ");
  return {
    id: `${doc.id}#${strategy}-${index}`,
    doc: doc.id,
    docTitle: doc.title,
    headings,
    start,
    end,
    text,
    // What actually gets embedded. Prepending the heading path gives a short
    // chunk the context it lost when it was cut out of its section.
    embedText: strategy === "structure" ? `${context}\n${text}` : text
  };
}

export function chunkDocs(docs, { strategy = "structure", size = 80, overlap = 20 } = {}) {
  return docs.flatMap((d) => (strategy === "fixed" ? fixedChunks(d, { size, overlap }) : structureChunks(d, { size })));
}
