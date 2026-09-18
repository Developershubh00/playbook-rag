// One door to the model. If ANTHROPIC_API_KEY is missing, or the call fails,
// callers get an LlmUnavailable error and decide their own fallback. Nothing
// here silently invents an answer.

export class LlmUnavailable extends Error {}

export const MODEL = process.env.LLM_MODEL || "claude-haiku-4-5-20251001";

export function llmConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function complete({ system, prompt, maxTokens = 500, timeoutMs = 9000, forceFail = false }) {
  if (forceFail) throw new LlmUnavailable("model unavailable (simulated outage)");
  if (!llmConfigured()) {
    const err = new LlmUnavailable("no ANTHROPIC_API_KEY set, so the rule-based path runs");
    err.retryable = false;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new LlmUnavailable(`model returned HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
      err.status = res.status;
      err.retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
    const data = await res.json();
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  } catch (err) {
    if (err instanceof LlmUnavailable) throw err;
    throw new LlmUnavailable(err.name === "AbortError" ? `model timed out after ${timeoutMs} ms` : err.message);
  } finally {
    clearTimeout(timer);
  }
}

export function parseJson(text) {
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new LlmUnavailable("model reply had no JSON object");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new LlmUnavailable("model reply was not valid JSON");
  }
}
