// Where the AI interpreter server lives. Empty means WAYMARK uses its built-in rules only.
// After deploying server/gemini-worker.js, paste its address here, for example
// 'https://waymark-interpreter.<your-name>.workers.dev'. This address is not a secret;
// the Gemini key stays on the server.
// Where the WAYMARK server (backend/) lives. Empty means the same address as this page,
// which is how `uvicorn` serves it locally. For GitHub Pages, put the hosted server's address here.
export const API_BASE = '';

export const AI_ENDPOINT = 'https://waymark-interpreter.pinnaclecrypt.workers.dev';
