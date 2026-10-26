# Orbit AI — Minimal Command-Following Agent

A minimal Node.js + HTML app. Orbit is prompted to do only the requested task, avoid unrelated extras, and ask a short clarification only when essential information is missing. Chat history is stored in the browser's localStorage.

## Deploy to Render

1. Upload the contents of this folder to the root of your GitHub repository. The structure must be:
   - `package.json`
   - `server.js`
   - `public/index.html`
2. In Render, open your existing Web Service and confirm:
   - Build command: `npm install` (or leave blank)
   - Start command: `npm start`
3. In Render → Environment, set `GEMINI_API_KEY` to a fresh Gemini API key. Do not put the key in GitHub or the HTML file.
4. Optional: set `GEMINI_MODEL` to a model ID that is available to your Google AI Studio project. The default is `gemini-3.8-flash`.
5. Save and deploy the latest commit.
6. Visit `/api/health`. It should show `configured: true` and the model being used.

## Local run

Requires Node.js 18+.

PowerShell:
```powershell
$env:GEMINI_API_KEY="YOUR_NEW_KEY"
npm start
```

Then open `http://localhost:3000`.

## Notes

- This is a command-following chat assistant, not a computer-control agent. It cannot click websites, deploy code, or change accounts by itself.
- If Gemini returns 429/503 or says a model is unavailable, check Google AI Studio model access and quota, and set `GEMINI_MODEL` to a supported model for your project.
- Chat history is local to the browser and is not shared across devices.
