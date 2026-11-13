# Stories by Reyansh 📷✨

AI photo editor for photographers, built with React + Vite. Upload any photo (JPG, PNG, WEBP, HEIC, TIFF, camera RAW), describe the edit, download in full resolution.

1. Upload a photo (drag & drop or click)
2. Type how you want it edited — English, Marathi or Hindi:
   - `make it brighter and warm`
   - `cinematic look with dark edges`
   - `थोडा उजेड वाढव आणि रंग जास्त`
   - `kami contrast, rotate left`
   - `brightness 30`
3. Fine-tune with sliders, hold **Compare** to see the original, then **Download** (full resolution JPG/PNG)

Every prompt produces an edit:

1. **✨ Generative AI** (when `GEMINI_API_KEY` is set) – like the Gemini app: remove objects, change background/sky, add effects. Output is the model's resolution (~1–2 MP).
2. **🤖 AI mode** (when an Anthropic API key is set) – Claude sees the photo and understands any wording in any language, e.g. `lagnasathi bhari kar`, `make it feel like a rainy evening`.
3. **⚡ Smart mode** – built-in English/Marathi/Hindi keywords and looks.
4. **✨ Auto-enhance** – anything not understood offline gets a photo-aware enhancement (exposure, contrast, colour cast, sharpness) plus mood hints from the prompt.

### Enable AI mode

```bash
cp .env.example .env
# put your keys in .env:
#   ANTHROPIC_API_KEY=sk-ant-...   (AI mode)
#   GEMINI_API_KEY=...             (Generative mode)
npm run dev   # restart
```

The key stays on the server (Vite middleware in `server/aiEditor.js`); in AI mode a small copy of the photo is sent to Claude to decide the edit. Rendering and export always happen in the browser.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Features

**Photo editor**: AI prompts (typed or spoken in English / मराठी / हिंदी), one-tap AI tools (remove background/objects, change sky, retouch, restore, colourise), exposure, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, HSL colour mixer, RGB tone curve, clarity, sharpen, blur, vignette, fade, grain, 20 looks + your own saved presets, crop with aspect ratios, straighten, rotate, flip, text & stickers (drag on the photo), border frames, watermark (text + logo), before/after, undo/redo, export JPG/PNG/WEBP up to 4K.

**Video & Reels studio**: photos → reel, trim / split / reorder / speed (slow motion), transitions (fade, slide, zoom, wipe, flash, blur), Ken Burns motion, looks, animated text (pop, fade, slide, typing, ticker, credits) with start/end times, your own song with start/end trim or built-in AI music by mood, original-sound volume, watermark, formats 9:16 / 16:9 / 1:1 / 4:5, MP4 export (WebM in Firefox). AI prompts like “wedding reel with romantic song, 30 sec”.

## Structure

- `src/App.jsx` – photo editor, AI routing, mode switch (Photo / Video & Reels), splash
- `src/components/` – UI: `PhotoPanels.jsx` (adjust, HSL, curve, filters, crop, text, frame), `Stage.jsx` (canvas, crop box, text drag), `ChatPanel.jsx` (AI chat + voice), `Logo.jsx`, `Splash.jsx`
- `src/utils/renderer.js` – photo rendering (preview + export are identical)
- `src/utils/promptParser.js` – offline prompt understanding (EN/MR/HI)
- `src/utils/presets.js`, `src/utils/brand.js` – looks, saved presets, watermark
- `src/video/` – `engine.js` (timeline, transitions, text, audio mix, export), `music.js` (built-in music), `videoPrompt.js`, `VideoStudio.jsx`, `VideoPanels.jsx`
- `server/aiEditor.js` – Claude: photo prompt routing + video planning; `server/geminiEditor.js` – generative edits
