export function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  return {};
}
const hits = new Map();
// Best-effort per-instance limiter; see README for what production would use.
export function rateLimited(req, { limit = 60, windowMs = 10 * 60 * 1000 } = {}) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "local").split(",")[0].trim();
  const now = Date.now();
  const e = hits.get(ip) || { count: 0, start: now };
  if (now - e.start > windowMs) { e.count = 0; e.start = now; }
  e.count += 1;
  hits.set(ip, e);
  return e.count > limit;
}
