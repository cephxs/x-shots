# x-shots

Framed screenshots of X posts. Paste a post link, pick a backdrop, tune the card, export a PNG.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5190. Use Chrome, Edge or Firefox. Safari's canvas does not support blur filters.

## Use

- Paste an X post link in the top field. Pasting anywhere on the page also works.
- Drop or paste an image on the preview to add it as a backdrop. Uploads go to `backdrops/`.
- Drag the card on the preview to move it. It snaps to the centre.
- Double-click a control's label to reset it.
- Type a name under **Looks** and click Save. The look goes to `presets/<name>.json`. Click a saved look to apply it.
- **Copy PNG** puts the image on the clipboard for the X composer. **Download** saves the file.
- X can recompress or refuse images over 5 MB. The export line shows the size. Grain makes PNGs much larger, because noise does not compress.

## How it works

- `src/post.js` gets the post from the FxTwitter API. If that fails, it uses X's embed feed through the dev-server proxy (`vite.config.js`). That feed has likes and replies only.
- The card is HTML (`src/post.js`, styled by `.post` in `index.html`). modern-screenshot turns it into an image.
- `src/main.js` stacks backdrop, shadow, glass rim and card on a canvas. The preview and the export use the same code, so the export matches the preview.
- `vite.config.js` also has the local save endpoints for `backdrops/` and `presets/`.

## Known limits

- Polls and link-preview cards are not drawn.
- Some long posts come back cut at about 280 characters from both sources.
- The post text cannot be edited. The card shows only what the post says.
- No headless real-screenshot mode yet.

`npm test` runs the check on the post parser against saved responses in `test/fixtures/`.
