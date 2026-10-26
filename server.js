import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const PUBLIC_DIR = join(process.cwd(), 'public');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}

const SYSTEM_INSTRUCTION = `You are Orbit, a narrowly scoped command-following assistant.
Follow the user's explicit request directly and stay within the requested task. Do not add unrelated features, unsolicited plans, or extra work. Do not overcomplicate simple requests. If the request is clear, do it without asking unnecessary questions. If a critical detail is missing, ask one short question. If the user asks for code, provide complete copy-paste-ready code and concise setup steps. Be honest: you cannot operate websites, deploy code, access accounts, or perform external actions unless a connected tool actually enables it. Never claim an action was completed when you only explained how to do it. Refuse unsafe or illegal requests briefly and offer a safe alternative. Use the user's language when practical.`;

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return send(res, 400, { error: 'Invalid URL' });
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true, configured: Boolean(API_KEY), model: MODEL });
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (!API_KEY) {
      return send(res, 503, { error: 'Server is not configured. Add GEMINI_API_KEY in Render Environment.' });
    }

    try {
      const input = await bodyJson(req);
      if (!Array.isArray(input.messages) || input.messages.length === 0) {
        return send(res, 400, { error: 'Send at least one message.' });
      }

      const contents = input.messages.slice(-30).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.text || '').slice(0, 12000) }]
      }));
      while (contents.length && contents[0].role !== 'user') contents.shift();
      if (!contents.length) return send(res, 400, { error: 'Please send a user message.' });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents,
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
          }),
          signal: AbortSignal.timeout(60000)
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || `Gemini API returned ${response.status}`;
        const status = response.status === 429 ? 429 : response.status === 400 ? 400 : 502;
        return send(res, status, { error: message, upstreamStatus: response.status });
      }

      const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      if (!answer) return send(res, 502, { error: 'Gemini returned no text. Try again.' });
      return send(res, 200, { answer });
    } catch (err) {
      console.error('Orbit request failed:', err);
      return send(res, 500, {
        error: err.name === 'TimeoutError' ? 'Gemini request timed out. Please retry.' : 'Request failed. Check Render logs.'
      });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch {
    return send(res, 400, { error: 'Invalid URL' });
  }
  const safe = normalize(pathname).replace(/^([.][.][/\\])+/, '').replace(/^[/\\]+/, '');
  const file = join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR + '/') && file !== PUBLIC_DIR) {
    return send(res, 403, { error: 'Forbidden' });
  }

  try {
    const content = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    return res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Orbit AI agent running on port ${PORT}`));
