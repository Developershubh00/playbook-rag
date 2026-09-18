import { evaluate } from "../lib/rag.js";
import { readBody, rateLimited } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (rateLimited(req, { limit: 20 })) return res.status(429).json({ error: "Too many evaluation runs. Try again in a few minutes." });
  try {
    return res.status(200).json(await evaluate(readBody(req).settings));
  } catch (err) {
    console.error("evaluate failed", err);
    return res.status(500).json({ error: err.message });
  }
}
