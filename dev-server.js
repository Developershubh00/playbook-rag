// Local server that mimics Vercel: static files from public/, functions from api/.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z-]/g, "");
    try {
      const mod = await import(`./api/${name}.js`);
      let raw = "";
      for await (const chunk of req) raw += chunk;
      req.body = raw ? JSON.parse(raw) : {};
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); };
      return await mod.default(req, res);
    } catch (err) {
      res.statusCode = 404; return res.end(JSON.stringify({ error: err.message }));
    }
  }
  const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  try {
    const data = await readFile(join("public", path));
    res.setHeader("content-type", TYPES[extname(path)] || "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404; res.end("Not found");
  }
}).listen(PORT, () => console.log(`PlaybookRAG running on http://localhost:${PORT}`));
