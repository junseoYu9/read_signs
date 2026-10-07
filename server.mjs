import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const apiKey = process.env.TYPECAST_API_KEY;
const voiceId = process.env.TYPECAST_VOICE_ID || "tc_672c5f5ce59fac2a48faeaee";
const root = process.cwd();
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/tts") {
    const text = url.searchParams.get("text")?.trim();
    if (!text || text.length > 80) return sendJson(response, 400, { error: "A short sign text is required." });
    if (!apiKey) return sendJson(response, 503, { error: "Typecast is not configured. Set TYPECAST_API_KEY on the server." });

    try {
      const typecastResponse = await fetch("https://api.typecast.ai/v1/text-to-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
          "User-Agent": "typecast-direct/1 node-fetch typecast-integration/1 (source=api-page; generated_by=codex)",
        },
        body: JSON.stringify({
          model: "ssfm-v30",
          voice_id: voiceId,
          text,
          language: "kor",
          prompt: { emotion_type: "smart" },
          output: { audio_format: "mp3", remove_silence_ms: 100 },
        }),
      });

      if (!typecastResponse.ok) {
        const detail = await typecastResponse.text();
        console.error(`Typecast error ${typecastResponse.status}`);
        return sendJson(response, 502, { error: "Typecast could not generate audio.", status: typecastResponse.status, detail: detail.slice(0, 180) });
      }

      response.writeHead(200, {
        "Content-Type": typecastResponse.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
      });
      response.end(Buffer.from(await typecastResponse.arrayBuffer()));
    } catch (error) {
      console.error("Typecast request failed", error instanceof Error ? error.message : error);
      sendJson(response, 502, { error: "The audio service is unavailable." });
    }
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(root, requested));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    response.writeHead(404); response.end("Not found"); return;
  }
  response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => console.log(`read_signs running at http://${host}:${port}`));
