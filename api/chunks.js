import { chunkMap, documents } from "../lib/rag.js";
import { readBody } from "../lib/http.js";
import { llmConfigured, MODEL } from "../lib/llm.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({
        docs: documents().map(({ id, title }) => ({ id, title })),
        mode: { generation: llmConfigured() ? `claude (${MODEL})` : "extractive (no API key)", embedding: process.env.OPENAI_API_KEY ? "text-embedding-3-small" : "local hashed TF-IDF" }
      });
    }
    const { doc, settings } = readBody(req);
    return res.status(200).json(await chunkMap(doc, settings));
  } catch (err) {
    console.error("chunks failed", err);
    return res.status(500).json({ error: err.message });
  }
}
