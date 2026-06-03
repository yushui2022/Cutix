# Public sample asset library

Cutix keeps local demo media out of Git. The repository commits only the seeding script and documentation; downloaded images, videos, thumbnails, keyframes, and `platform/data/assets.json` are ignored so the GitHub repository does not grow by tens or hundreds of megabytes.

## How to seed

Run from `platform`:

```bash
npm run assets:seed
```

The script downloads a Wikimedia Commons sample set into:

- `platform/public/samples/commons`
- `platform/public/samples/commons/thumbnails`
- `platform/public/samples/commons/keyframes`
- `platform/data/assets.json`

The Web asset library reads `platform/data/assets.json` through `/api/assets`, so the samples appear in the UI after the dev server refreshes.

## Current sample scope

The seeded library focuses on commercial IP video production tests. The default run targets `90` assets, including `8` videos. Auto-discovered videos are capped at `6MB` by default so local storage and render tests stay manageable; the curated fallback set is kept around the same size range.

- Office and enterprise-service B-roll
- Retail storefront and product display imagery
- Restaurant kitchen and cafe scene assets
- Warehouse and logistics imagery
- Business chart / proof-of-growth imagery
- Factory, production, packaging, education, exhibition, service, and live-room imagery

Each asset is pre-tagged with scene, industry, shot type, usage, and platform-fit tags. Video files also get generated thumbnails and keyframes so the asset-card preview and future visual-model analysis path have real frames to work with.

## Seed controls

The default settings can be adjusted without editing the script:

```bash
CUTIX_SAMPLE_ASSET_TARGET=120 CUTIX_SAMPLE_VIDEO_TARGET=12 CUTIX_SAMPLE_MAX_VIDEO_MB=6 npm run assets:seed
```

- `CUTIX_SAMPLE_ASSET_TARGET`: total local sample assets to seed.
- `CUTIX_SAMPLE_VIDEO_TARGET`: target number of video assets.
- `CUTIX_SAMPLE_MAX_VIDEO_MB`: maximum downloaded size for each auto-discovered video.
- `CUTIX_SAMPLE_SEARCH_LIMIT`: Wikimedia Commons search results scanned per profile.

## License handling

The seed set uses Wikimedia Commons assets with licenses that allow local demo and development use. `CC0` and public-domain assets are prioritized. The fallback discovery path also allows Creative Commons attribution licenses when needed, while excluding non-commercial licenses. The local `platform/public/samples/commons/ATTRIBUTION.md` file is regenerated with source URLs, authors, and license labels.

These files are good for demos, UI testing, and pipeline tests. They should not replace the client's own licensed material library in production. For a real customer deployment, the same metadata structure should be populated from their approved internal asset library and any explicitly licensed public-stock library they authorize.
