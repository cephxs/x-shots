# x-shots

Framed screenshots of X posts, or of any image. Paste a post link or an image, pick a backdrop, tune the card, export a PNG.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5190. Use Chrome, Edge or Firefox. Safari's canvas does not support blur filters.

## Use

- Paste an X post link in the top field. Pasting anywhere on the page also works.
- To frame an image instead of a post, paste it anywhere (the link field too), drop it on the preview, or click **Image**. Images go to `shots/`.
- To add a backdrop, drop an image on the Backdrop rail or click its **+** tile. Backdrops go to `backdrops/`.
- While an image is the subject, the post-only controls (theme, text size, padding, show and count toggles) are off.
- Drag the card on the preview to move it. It snaps to the centre.
- Open the page with `?dials` (http://localhost:5190/?dials) to get a DialKit popover with every control from the side panel. The two stay in sync. Position, pan and shadow offset are dial pads.
- The sliders are DialKit sliders. Drag anywhere on the bar, or hover the value and type one.
- Double-click a slider, or a control's label, to reset it.
- Type a name under **Looks** and click Save. The look goes to `presets/<name>.json`. Click a saved look to apply it.
- `presets/Default Template.json` is the default for every control. Save over "Default Template" to change the defaults.
- Git ignores your own uploads and looks. Only the Default Template and its backdrop are in the repo.
- **Copy PNG** puts the image on the clipboard for the X composer. **Download** saves the file.
- X can recompress or refuse images over 5 MB. The export line shows the size. Grain makes PNGs much larger, because noise does not compress.

## How it works

- `src/post.js` gets the post from the FxTwitter API. If that fails, it uses X's embed feed through the dev-server proxy (`vite.config.js`). That feed has likes and replies only.
- The card is HTML (`src/post.js`, styled by `.post` in `index.html`). modern-screenshot turns it into an image.
- `src/main.js` stacks backdrop, shadow, glass rim and card on a canvas. The preview and the export use the same code, so the export matches the preview.
- `src/dials.js` builds the DialKit panel (`dialkit/vanilla`, version 2) from the same control list as the side panel. App state stays the one store. DialKit saves nothing of its own.
- An image subject skips the HTML step. The canvas draws its own pixels at the card width.
- `vite.config.js` also has the local save endpoints for `backdrops/`, `shots/` and `presets/`.

## Known limits

- Polls and link-preview cards are not drawn.
- Some long posts come back cut at about 280 characters from both sources.
- The post text cannot be edited. The card shows only what the post says.
- No headless real-screenshot mode yet.

`npm test` runs the check on the post parser against saved responses in `test/fixtures/`.
