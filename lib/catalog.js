// Demo catalog: 60 music tracks + 40 podcast episodes, each with a real (generated) audio file
// at public/audio/<trackId>.wav. Embeddings come from the audio itself (see lib/clap.js).
//
// To use a real catalog instead, point `audioFile` at your own files and run `npm run seed`.

const path = require('path');

const AUDIO_DIR = path.join(__dirname, '..', 'public', 'audio');
const PRESET_DIR = path.join(__dirname, '..', 'public', 'presets');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// `genre` names the renderer in lib/synth.js (music) or lib/podcast.js (podcasts)
const CATEGORIES = [
  { name: 'Lo-fi Beats', kind: 'music', genre: 'lofi', hue: 265,
    titles: ['Rainy Window', 'Late Night Study', 'Paper Lanterns', 'Slow Coffee', 'Tape Hiss Dreams', 'Corner Store Glow', 'Sunday Fog', 'Vinyl Crackle Lane', 'Midnight Bus Ride', 'Soft Static'],
    artists: ['Moth & Mellow', 'Pale Harbor', 'Quiet Arcade', 'Nori Tape', 'Hazel Loop'] },
  { name: 'Jazz', kind: 'music', genre: 'jazz', hue: 35,
    titles: ['Blue Hour Standard', 'Brushes on Velvet', 'Autumn in Harlem', 'Third Set Blues', 'Smoke & Mirrors', 'Walking Bass Home', 'After the Last Call', 'Modal Sunrise', 'Cool Corner', 'Quartet for Rain'],
    artists: ['The Marlowe Quartet', 'Ines Calder Trio', 'Dex Holloway', 'Sable Room Ensemble', 'June Averill'] },
  { name: 'Electronic', kind: 'music', genre: 'electronic', hue: 190,
    titles: ['Neon Circuit', 'Pulse Width', 'Afterburn', 'Glass Skyline', 'Sub Zero Drop', 'Warehouse 9', 'Phase Shift', 'Lightspeed Garden', 'Carrier Wave', 'Hyperlane'],
    artists: ['Voltage Choir', 'KAI-9', 'Lumen Drift', 'Static Bloom', 'Arcline'] },
  { name: 'Indie Rock', kind: 'music', genre: 'rock', hue: 12,
    titles: ['Parking Lot Anthem', 'Wired Summer', 'Cracked Sunglasses', 'Highway Static', 'Small Town Fireworks', 'Rust & Honey', 'Basement Show', 'Counting Streetlights', 'Loose Change', 'Faded Tour Shirt'],
    artists: ['The Halcyon Kids', 'Ruby & the Vans', 'Fox Parade', 'Gold Teeth', 'Low Tide Club'] },
  { name: 'Classical', kind: 'music', genre: 'classical', hue: 330,
    titles: ['Nocturne in D Minor', 'Spring Sonata, Mvt. II', 'Variations on a Winter Theme', 'String Quartet No. 4', 'Prelude for Solo Cello', 'Adagio in Grey', 'Pastoral Suite', 'Fugue for Four Hands', 'Elegy at Dusk', 'Concerto for Harp'],
    artists: ['Orchestra Aurelia', 'Helena Voss', 'The Kessler Ensemble', 'Marcus Bell', 'Sofia Ardent'] },
  { name: 'Hip-Hop', kind: 'music', genre: 'hiphop', hue: 50,
    titles: ['City Lights Cipher', 'Gold Chain Gospel', 'Block Party Math', 'Trunk Rattle', 'Overtime Verses', 'Corner Office Dreams', 'Concrete Poetry', 'Run It Back', 'Midtown Bounce', 'Heavy Crown'],
    artists: ['Rook', 'Mara Kane', 'Big Ledger', 'Tidewater Jones', 'DJ Pallas'] },
  { name: 'True Crime', kind: 'podcast', genre: 'podcast', hue: 0,
    titles: ['The Vanishing at Mill Creek', 'Cold Case: Room 214', 'Eleven Minutes', 'The Lighthouse Letters', 'Dead Air', 'What the Neighbors Heard', 'The Last Ferry', 'Paper Trail', 'Inside Job', 'Silent Witness'],
    artists: ['Unsolved Hours', 'Case Files Weekly', 'Dark Ledger', 'The Long Night', 'Open Verdict'] },
  { name: 'Tech Talk', kind: 'podcast', genre: 'podcast', hue: 215,
    titles: ['Is the Cloud Overrated?', 'Shipping on Fridays', 'The Database Wars', 'Why Your Build Is Slow', 'Open Source Burnout', 'Edge Computing Explained', 'Postmortem Culture', 'Hiring in a Down Market', 'Scaling to a Million Users', 'The API Nobody Wanted'],
    artists: ['Stack Overflowed', 'The Pull Request', 'Latency Show', 'Devs After Dark', 'Byte Size'] },
  { name: 'Comedy', kind: 'podcast', genre: 'podcast', hue: 85,
    titles: ['Worst Roommate Stories', 'Airport Rants Live', 'My Dad the Influencer', 'Improv Gone Wrong', 'Two Idiots, One Mic', 'The Great Sandwich Debate', 'Open Mic Disasters', 'Craigslist Confessions', 'Unqualified Advice', 'Holiday Meltdown'],
    artists: ['Laugh Track Lounge', 'The Bit Show', 'Chaos Brunch', 'Half-Baked Takes', 'Punchline Pals'] },
  { name: 'Interviews', kind: 'podcast', genre: 'podcast', hue: 160,
    titles: ['A Conversation with a Founder', 'Craft & Discipline', 'The Long Way to Success', 'On Writing and Doubt', 'Lessons from Failure', 'How She Built It', 'Beyond the Resume', 'The Quiet Leader', 'Second Acts', 'What I Wish I Knew'],
    artists: ['Deep Dive Radio', 'Fireside Questions', 'The Origin Story', 'Talk Slowly', 'Big Questions Hour'] },
];

function generateCatalog() {
  const rand = mulberry32(20261028);
  const items = [];
  let id = 1;
  for (const cat of CATEGORIES) {
    cat.titles.forEach((title, i) => {
      items.push({
        trackId: id,
        title,
        creator: cat.artists[i % cat.artists.length],
        kind: cat.kind,
        category: cat.name,
        genre: cat.genre,
        hue: cat.hue,
        releaseYear: 2018 + Math.floor(rand() * 9),
        plays: Math.floor(1000 + rand() * 480000),
        audioUrl: `/audio/${id}.wav`,
        audioFile: path.join(AUDIO_DIR, `${id}.wav`),
      });
      id++;
    });
  }
  return items;
}

// Query clips for the demo. None of these are in the catalog: each is a fresh render
// (different seed, title, hosts) so results show "sounds like", not exact lookup.
const PRESETS = [
  { id: 'lofi', label: 'Late-night lo-fi loop', category: 'Lo-fi Beats', genre: 'lofi', title: 'Neighbors Upstairs', creator: 'Unsigned' },
  { id: 'jazz', label: 'Smoky jazz combo', category: 'Jazz', genre: 'jazz', title: 'Basement Club', creator: 'Unsigned' },
  { id: 'edm', label: 'Club four-on-the-floor', category: 'Electronic', genre: 'electronic', title: 'Strobe', creator: 'Unsigned' },
  { id: 'rock', label: 'Garage band rehearsal', category: 'Indie Rock', genre: 'rock', title: 'Garage Take 3', creator: 'Unsigned' },
  { id: 'strings', label: 'String section at dusk', category: 'Classical', genre: 'classical', title: 'Evening Serenade', creator: 'Unsigned' },
  { id: 'hiphop', label: 'Boom-bap beat with a verse', category: 'Hip-Hop', genre: 'hiphop', title: 'Uptown Express', creator: 'Unsigned' },
  { id: 'crime', label: 'True-crime cold open', category: 'True Crime', genre: 'podcast', title: 'The Missing Ledger', creator: 'Night Desk' },
  { id: 'tech', label: 'Two hosts debating tech', category: 'Tech Talk', genre: 'podcast', title: 'Monoliths Strike Back', creator: 'Merge Conflict' },
  { id: 'comedy', label: 'Comedy banter', category: 'Comedy', genre: 'podcast', title: 'Gym Membership Horror', creator: 'Snack Break' },
].map((p, i) => ({ ...p, seed: 9000 + i, audioUrl: `/presets/${p.id}.wav`, audioFile: path.join(PRESET_DIR, `${p.id}.wav`) }));

module.exports = { generateCatalog, CATEGORIES, PRESETS, AUDIO_DIR, PRESET_DIR, mulberry32, hash };
