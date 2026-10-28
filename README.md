# Resonance: audio-to-audio search on MongoDB Atlas Vector Search

Pick an audio clip and get back the songs and podcast episodes in the catalog that sound most like it, including the moment in each track where the match occurs.

## How it works

1. Every catalog file is cut into overlapping 10-second windows (2.5 s hop).
2. Each window is embedded with [CLAP](https://github.com/LAION-AI/CLAP) (`Xenova/clap-htsat-unfused`, run locally with transformers.js) into a 512-dim vector and stored in the `segments` collection.
3. A query clip is embedded the same way, then `$vectorSearch` finds the nearest segments, which are grouped to the best segment per track.
4. Whole-track vectors (mean of each track's windows) in `tracks` power the track-to-track "Sounds like" view.

## Demo catalog

The 100-item catalog (60 music tracks, 40 podcast episodes) and the 9 query clips are generated locally. The music is synthesized in code and the podcasts use the Windows text-to-speech voices. The query clips are not in the catalog.

To use real audio, point `audioFile` for each item in `lib/catalog.js` at your own 16-bit WAV files and run `npm run seed`.

## Running it

Requires Node 18+, a MongoDB Atlas cluster, and Windows for `npm run generate` (text-to-speech).

```
npm install
copy .env.example .env      # set MONGODB_URI
npm run generate            # renders audio into public/audio and public/presets (~150 MB)
npm run seed                # embeds audio, loads Atlas, builds both vector indexes
npm start                   # http://localhost:3000
```

The first `seed` / `start` downloads the CLAP model into `.model-cache/`.

## API

- `POST /api/search/audio?limit=8&kind=music|podcast` with a WAV body returns the best-matching tracks, with `score` and `matchStart` (seconds).
- `GET /api/tracks/:id/similar` returns tracks similar to a catalog track.
- `GET /api/tracks`, `GET /api/categories`, `GET /api/presets`, `GET /api/status`
