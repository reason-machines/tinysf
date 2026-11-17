# tiny SF

San Francisco rebuilt in blocks on one tiny hexagonal island. The island's
outline is the Reason mark, so the Golden Gate Bridge crosses its two lagoons.

It is one HTML file, `index.html`, with no dependencies and no network
requests. It does two things:

- **Walk around.** Open it and you are dropped at a random spot on the island.
  WASD to move, mouse to look, space to jump, shift to run, F to fly, R for
  somewhere else, T for the time of day. On a phone: left thumb moves, the
  rest of the screen looks. There are twelve corgis to find. Opened as a
  file it is the same island with nobody else on it.
- **Watch the film.** Open `index.html?film` for a 40 second film of drone
  shots over the same island.

## Live

**https://tinysf.reasonmachines.com**: open it and walk in. No sign-in.
Everyone who is on the island at the same time sees everyone else.

- **Other people** are block people with a name tag. Pick a name on the first
  screen or keep the one you are given. Your browser keeps a random key, and
  that key is your whole account: the same browser gets the same name, look
  and corgi count next time.
- **Talk** with Enter. Only people within 48 blocks hear it, it shows over
  your head, and nothing said is stored.
- **Meet here** copies a link that lands whoever opens it two steps from where
  you stand. The **People** menu puts you next to someone who is online.
- **Wave** with G. **V** switches to an over-the-shoulder view of yourself.
- **Locals**: 34 walkers (in vests, with coffees, tourists, runners,
  skaters), a third of them walking a dog, and six cats. Nobody simulates
  them: each one's whole ramble over the street grid is fixed by the island's
  seed and walked by the clock, and the page takes its clock from the server,
  so every visitor sees the same person at the same corner.

## What is on the island

Golden Gate Bridge, Salesforce Tower, the Transamerica Pyramid, the Palace of
Fine Arts and its lagoon, Coit Tower, Sutro Tower on Twin Peaks, the Ferry
Building, the Embarcadero piers, Pier 39 and its sea lions, the Painted Ladies
on Alamo Square, Golden Gate Park and its windmill, Ocean Beach, the Presidio,
a few hundred pastel row houses, cable cars over Nob Hill, robotaxis, gulls,
pelicans, sailboats, a Y Combinator cube, an NVIDIA block, two billboards and
a tower that is still going up.

None of it is surveyed. It is the city from memory, squeezed onto a hexagon.

## Run it

```bash
bun build.ts                 # src/ + assets/ -> index.html
bun server/server.ts        # http://localhost:4173 with multiplayer, or just open index.html
```

Any static host can serve `index.html` for an island of your own; seeing other
people needs the server.

## The server

`server/server.ts` is one Bun file with no dependencies. It serves
`index.html`, relays positions over one WebSocket (`/ws`, ten updates a
second), and keeps players' names, looks and corgi counts plus the island's
visit count in DynamoDB, signed by hand so there is no SDK to install.

```bash
bun server/server.ts                       # http://localhost:4173, no database: memory only
bun test/meet.ts http://localhost:4173     # two headless browsers meet, talk and wave
```

Limits: 150 people at once, 8 connections per address, 60 messages a second
each, one chat line per 0.7 s, names 18 characters, chat 140. Positions are
taken on trust (a browser says where it is), which is fine for walking around
and would not be for anything competitive.

## Deploy

`infra/deploy.sh` builds and runs the whole thing on AWS: one t4g.small in
us-west-2 behind CloudFront (which gives it HTTPS and carries the WebSocket),
a DynamoDB table `tiny-sf`, and an S3 bucket for the two files that make up a
release. The instance accepts traffic from CloudFront only and has no SSH.

```bash
bun build.ts && bun build server/server.ts --target=bun --outfile dist/server.js
infra/deploy.sh push       # upload index.html + server.js, restart, print the journal
infra/deploy.sh status
infra/deploy.sh up         # create whatever is missing (idempotent)
infra/deploy.sh down       # delete everything it created
```

It needs AWS credentials for the account it deploys to. `infra/state.json`
(not committed) caches the ids of what it created; every step also finds its
resource by name, so the file can be deleted.

## Render the film

Rendering steps the page one frame at a time in headless Chromium with
software WebGL, so it needs Chromium and ffmpeg but no GPU.

```bash
bun render.ts --scale 0.5 --frames mid      # one still per shot
bun render.ts --scale 0.75 --jobs 3         # out/tiny-sf.mp4
bun render.ts --walk --shots shots.json     # stills of the walkable world
```

The film render is resumable: it is drawn in 48-frame chunks and a rerun draws
only the missing ones. `--scale` is the share of 1080p the 3D picture is drawn
at; the page around it is always 1080p. Drop it on a machine with a GPU.

## Source

| File | What it holds |
| --- | --- |
| `src/00-maths.js` | hashes, noise, vectors and matrices |
| `src/05-config.js` | the URL switches |
| `src/10-materials.js` | every kind of block |
| `src/20-world.js` | the island: shore, hills, street grid, row houses, towers, trees |
| `src/30-landmarks.js` | where each landmark goes and how it is stacked, and the block font for signs |
| `src/35-actors.js` | corgis, birds, sea lions, cars, cable cars and boats |
| `src/36-people.js` | block people, the walkers' routes over the street grid, dogs on leads, cats |
| `src/40-mesh.js` | blocks to triangles (greedy quads with per-corner ambient occlusion) |
| `src/50-gl.js` | WebGL2: shaders, shadows, water reflections, sky, fog, bloom |
| `src/60-film.js` | the film's shots |
| `src/70-walk.js` | walking: collisions, controls, spawning, the HUD |
| `src/75-net.js` | other people: the WebSocket, name tags, chat, meet-here links |
| `src/80-boot.js` | start-up |
| `server/server.ts` | the server |
| `infra/deploy.sh` | the AWS stack |
| `test/meet.ts` | the two-browser test |
| `src/shell.html` | the page around it |

The parts share one scope and are joined in name order; there is no bundler.
`?seed=N` gives another arrangement of the ordinary buildings.

## Credits

Built by [Reason](https://reasonmachines.com). The film's format follows
@cdngdev's "the entire world in Minecraft at 1:1 scale" post; nothing from it
is used here. Fonts: Inter and JetBrains Mono, both under the SIL Open Font
License. Landmark, company and product names belong to their owners and are
used here as a fan's sketch of a city; this project is not affiliated with or
endorsed by any of them.

## License

MIT, see `LICENSE`. The Reason name and mark are Reason Machines' and are not
part of that grant.
