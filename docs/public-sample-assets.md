# Public sample asset library

Cutix keeps local demo media out of Git. The repository commits only the seeding script and documentation; downloaded images, videos, thumbnails, keyframes, and `platform/data/assets.json` are ignored so the GitHub repository does not grow by tens or hundreds of megabytes.

## How to seed

Run from `platform`:

```bash
npm run assets:seed
```

The script downloads a small Wikimedia Commons sample set into:

- `platform/public/samples/commons`
- `platform/public/samples/commons/thumbnails`
- `platform/public/samples/commons/keyframes`
- `platform/data/assets.json`

The Web asset library reads `platform/data/assets.json` through `/api/assets`, so the samples appear in the UI after the dev server refreshes.

## Current sample scope

The seeded library focuses on commercial IP video production tests:

- Office and enterprise-service B-roll
- Retail storefront and product display imagery
- Restaurant kitchen and cafe scene assets
- Warehouse and logistics imagery
- Business chart / proof-of-growth imagery

Each asset is pre-tagged with scene, industry, shot type, usage, and platform-fit tags. Video files also get generated thumbnails and keyframes so the asset-card preview and future visual-model analysis path have real frames to work with.

## License handling

The seed set currently uses Wikimedia Commons assets marked as `CC0 1.0` wherever possible. The local `platform/public/samples/commons/ATTRIBUTION.md` file is regenerated with source URLs, authors, and license labels.

These files are good for demos, UI testing, and pipeline tests. They should not replace the client's own licensed material library in production. For a real customer deployment, the same metadata structure should be populated from their approved internal asset library and any explicitly licensed public-stock library they authorize.
