# Social media images

7 designs, rendered for every platform size:

| Folder | Size | Use |
|---|---|---|
| `linkedin/landscape-1200x627` | 1200×627 | LinkedIn link/landscape post |
| `linkedin/square-1200x1200` | 1200×1200 | LinkedIn square |
| `linkedin/portrait-1080x1350` | 1080×1350 | LinkedIn portrait |
| `x/landscape-1600x900` | 1600×900 | X landscape |
| `x/square-1200x1200` | 1200×1200 | X square |
| `x/portrait-1080x1350` | 1080×1350 | X portrait |
| `instagram/portrait-1080x1350` | 1080×1350 | Instagram feed (best reach) |
| `instagram/square-1080x1080` | 1080×1080 | Instagram square |
| `instagram/landscape-1080x566` | 1080×566 | Instagram landscape |
| `instagram/story-1080x1920` | 1080×1920 | Stories and Reels covers |

`_by-size/` holds each unique size once. Captions for every design and platform: [CAPTIONS.md](CAPTIONS.md). Photo credits: [CREDITS.md](CREDITS.md).

## Re-rendering
The designs are HTML (`src/template.html`), with the copy for each post in `src/render.mjs`. To change copy and re-render:
```
cd marketing/social/src
npm i --no-save playwright && npx playwright install chromium
node render.mjs ..
```
