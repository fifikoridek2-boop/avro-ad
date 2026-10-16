# Avro ad — render

Frame-exact render of the Avro opening ad (`index.html`) to **MP4, 1920×1080, 60 fps, H.264**.

## On GitHub
Actions → **Render Avro ad** → *Run workflow* (or push to `main`).
Four segments render in parallel, are joined without re-encoding, and the result is the artifact **avro-ad-1080p60**.
The job fails if three.js or the Outfit font did not load, so the phone text is never silently wrong.

## Locally
```
npm install && npx playwright install chromium
npm run render            # -> out/avro-ad.mp4
node export-avro.js index.html t.mp4 --from 8.8 --to 11   # a short test clip
```
Offline: `--three ./three.min.js` and install the Outfit font.
