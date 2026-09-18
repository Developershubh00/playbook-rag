import { answer } from "../lib/rag.js";
import { readBody, rateLimited } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST with a question" });
  if (rateLimited(req)) return res.status(429).json({ error: "Too many questions from this address. Try again in a few minutes." });
  try {
    const { question, settings } = readBody(req);
    return res.status(200).json(await answer(question, settings));
  } catch (err) {
    const client = /Ask a question/.test(err.message);
    if (!client) console.error("ask failed", err);
    return res.status(client ? 400 : 500).json({ error: err.message });
  }
}
