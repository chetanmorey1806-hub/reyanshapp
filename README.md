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

## Structure

- `src/utils/promptParser.js` – turns a prompt into adjustment values (add new words/looks in `RULES`)
- `src/utils/renderer.js` – draws the photo with adjustments on a canvas (preview + export)
- `src/utils/adjustments.js` – adjustment defaults and slider ranges
- `src/components/` – UI (upload, canvas, prompt chat, sliders, toolbar)
