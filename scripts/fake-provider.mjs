// خادم مزودين وهمي للاختبار اليدوي/التكاملي (ليس للإنتاج).
// /quota/*  → OpenAI-compatible يرد 429 insufficient_quota
// /gemini/* → بروتوكول Gemini ناجح
// /ollama/* → بروتوكول Ollama ناجح (النموذج tiny:1b)
import http from "node:http";
const port = Number(process.env.PORT || 4010);
const log = [];
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    log.push(`${req.method} ${req.url}`);
    const send = (s, o) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/_log") return send(200, log);
    if (req.url.startsWith("/quota/")) return send(429, { error: { code: "insufficient_quota", message: "You exceeded your current quota" } });
    if (req.url.startsWith("/gemini/")) {
      const hasKey = Boolean(req.headers["x-goog-api-key"]);
      const sys = JSON.parse(body).systemInstruction?.parts?.[0]?.text ?? "";
      return send(200, { candidates: [{ content: { parts: [{ text: `رد تجريبي من Gemini الوهمي (مفتاح:${hasKey ? "نعم" : "لا"}) — ${sys.includes("ممنوع منعاً باتاً") ? "وضع التلميح" : "وضع الحل"}` }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } });
    }
    if (req.url === "/ollama/api/tags") return send(200, { models: [{ name: "tiny:1b" }] });
    if (req.url === "/ollama/api/ps") return send(200, { models: [] });
    if (req.url === "/ollama/api/chat") return send(200, { message: { content: "رد تجريبي من Ollama الوهمي" } });
    send(404, {});
  });
}).listen(port, "127.0.0.1", () => console.log("fake providers on", port));
