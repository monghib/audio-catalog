// Podcast episode scripts + mixing (TTS hosts over intros / music beds), and hip-hop verses.
const synth = require('./synth');
const { SR, buffer, mixInto, pick, range } = synth;

// Lines prefixed with "*" get a rimshot after them (comedy)
const SCRIPTS = {
  'True Crime': {
    intro: 'This is {show}. I am your host, and tonight\'s story is called {title}.',
    pairs: false,
    lines: [
      'It was a little after midnight when the first call came in to the county sheriff\'s office.',
      'The caller didn\'t give a name. She only said that something was wrong at the house on the hill.',
      'By the time deputies arrived, the porch light was still on, and the front door was standing open.',
      'There were no signs of a struggle. The car was in the driveway. Dinner was still on the table.',
      'Investigators would spend the next eleven years trying to explain what happened in those few hours.',
      'Neighbors remembered hearing a car engine idling on the gravel road, just before dawn.',
      'The detective who caught the case told me he still keeps a copy of the file in his desk drawer.',
      'Every witness told a slightly different story. And every story left something out.',
      'Then, almost three years later, a letter arrived with no return address.',
      'Inside was a single photograph, and a date, written on the back in pencil.',
      'Stay with us. After the break, we will hear from the one person who was never interviewed.',
    ],
  },
  'Tech Talk': {
    intro: 'Welcome back to {show}. Today\'s episode: {title}.',
    pairs: false,
    lines: [
      'So I want to start with a hot take. Most teams don\'t have a scaling problem, they have a measurement problem.',
      'Okay, hold on. When your database is at ninety percent CPU, that is not a measurement problem.',
      'Sure, but how many people actually profiled the query before they bought a bigger instance?',
      'Fair. We moved one index last quarter, and our latency dropped by half.',
      'That\'s my point. Observability first, then architecture.',
      'Let\'s talk about deploys. Do you ship on Fridays?',
      'We do, but only because a rollback takes about thirty seconds.',
      'That is the real feature. Fast rollback beats perfect testing every time.',
      'I also think vector search is going to show up in every app this year.',
      'Agreed. Searching by meaning instead of keywords is a huge unlock for users.',
      'Before we wrap, a quick thank you to everyone who sent in questions on the forum.',
    ],
  },
  Comedy: {
    intro: 'Hey hey, welcome to {show}! Today we are talking about {title}, and I already regret it.',
    pairs: false,
    lines: [
      'Okay so my roommate labels his food. Not just his name. The date, and the calorie count.',
      '*That\'s not a roommate, that\'s a grocery store.',
      'Then he started labeling the ice cubes. The ice cubes!',
      'Wait, how do you even label an ice cube?',
      '*Tiny sticky notes. They fall off when they melt, and then he blames me!',
      'I flew last week and the guy next to me took off his shoes. And his socks.',
      '*No. Absolutely not. That is a crime in at least four states.',
      'He offered me half of his tuna sandwich. On a plane!',
      '*Of course I took it, I am not an animal, it was a long flight.',
      'That\'s our show everybody, tell your friends, tell your enemies.',
      '*Mostly your enemies, honestly.',
    ],
  },
  Interviews: {
    intro: 'Welcome to {show}. Today I am sitting down for a conversation we have called {title}.',
    pairs: true,
    lines: [
      'So take me back to the beginning. What were you doing before all of this started?',
      'Honestly, I was working nights at a hotel front desk, and writing on my breaks.',
      'When did you realize this could be more than a side project?',
      'There wasn\'t one moment. It was a hundred small signs that people actually cared.',
      'What is the hardest lesson you have had to learn?',
      'That saying no is a skill. Every yes costs you something you can\'t see yet.',
      'What would you tell someone who is just starting out?',
      'Start smaller than you think, and finish things. Finishing is the whole game.',
      'How do you deal with doubt?',
      'I don\'t try to make it go away. I just don\'t let it hold the pen.',
    ],
  },
};

const STYLE = {
  'True Crime': { words: 95, rates: [-1, -1], narrator: true },
  'Tech Talk': { words: 110, rates: [0, 1] },
  Comedy: { words: 115, rates: [2, 3] },
  Interviews: { words: 100, rates: [-1, 0] },
};

// Two hosts per show with a distinct voice / pitch
function hosts(rand) {
  const first = pick(rand, ['david', 'zira']);
  return [
    { voice: first, shift: range(rand, 0.9, 1.06) },
    { voice: first === 'david' ? 'zira' : 'david', shift: range(rand, 0.94, 1.08) },
  ];
}

// Picks script lines for one episode -> TTS jobs (each tagged with rimshot flag)
function episodeJobs(item, rand, hostRand) {
  const script = SCRIPTS[item.category], style = STYLE[item.category];
  const [a, b] = hosts(hostRand);
  const fill = (s) => s.replace('{show}', item.creator).replace('{title}', item.title);
  const lines = [{ host: 0, text: fill(script.intro) }];
  let words = lines[0].text.split(' ').length;
  const pool = script.lines;
  let i = Math.floor(rand() * pool.length);
  if (script.pairs) i -= i % 2;
  while (words < style.words) {
    const raw = pool[i % pool.length];
    const host = style.narrator ? (rand() < 0.8 ? 0 : 1) : script.pairs ? ((i % 2) ? 1 : 0) : lines.length % 2;
    lines.push({ host, text: raw.replace(/^\*/, ''), rimshot: raw.startsWith('*') });
    words += raw.split(' ').length;
    i++;
  }
  return lines.map((l) => {
    const h = l.host ? b : a;
    return { voice: h.voice, shift: h.shift, rate: style.rates[l.host], text: l.text, rimshot: l.rimshot };
  });
}

function drone(rand, dur) {
  const bed = buffer(dur);
  const root = synth.mtof(36 + Math.floor(rand() * 6));
  for (const f of [root, root * 1.5, root * 2.02]) mixInto(bed, 0, synth.strings(rand, f, dur - 1, { attack: 3, release: 1, cutoff: 500 }), 0.3);
  return bed;
}

function rimshot(rand) {
  const n = synth.snare(rand, { tone: 400, decay: 0.08, noise: 0.4, hi: 9000 });
  mixInto(n, 0, synth.cymbal(rand, { decay: 0.6, base: 520, noise: 0.6 }), 0.4);
  return n;
}

// Lay the spoken lines end to end with intro music / bed for each show format
function mixEpisode(item, jobs, voices, rand) {
  const maxDur = 48;
  const out = buffer(maxDur), bed = buffer(maxDur);
  let t = 0.4;
  if (item.category === 'Tech Talk') { mixInto(out, 0, synth.electronic(rand, 3.5), 0.5); t = 3; }
  if (item.category === 'Comedy') { mixInto(out, 0, synth.rock(rand, 2.8), 0.5); t = 2.5; }
  if (item.category === 'Interviews') { mixInto(bed, 0, synth.classical(rand, maxDur, 'Nocturne'), 0.1); mixInto(out, 0, synth.classical(rand, 4, 'Nocturne'), 0.5); t = 3.5; }
  if (item.category === 'True Crime') mixInto(bed, 0, drone(rand, maxDur), 0.25);
  voices.forEach((v, i) => {
    if (t + v.length / SR > maxDur - 0.5) return;
    mixInto(out, t, v, 0.9);
    t += v.length / SR;
    if (jobs[i].rimshot) { mixInto(out, t + 0.05, rimshot(rand), 0.35); t += 0.35; }
    t += range(rand, 0.25, 0.5);
  });
  const end = Math.min(maxDur, t + 0.8);
  const clip = out.subarray(0, Math.ceil(end * SR));
  for (let i = 0; i < clip.length; i++) clip[i] += bed[i];
  return synth.finalize(clip, { drive: 1 });
}

const RAP_LINES = [
  '{title}, yeah, we came up from the block to the top',
  'Late night in the city and the beat don\'t stop',
  'Counting every verse like I\'m counting the cost',
  'Never been afraid of the work or the loss',
  'Lights on the avenue, the bass in the trunk',
  'Every single bar hitting harder than a punch',
  'Mama said keep going when the money get thin',
  'Now we in the building and we never cave in',
];

function rapJobs(item, rand) {
  const voice = pick(rand, ['david', 'david', 'zira']);
  const shift = range(rand, 0.88, 1.02);
  const start = Math.floor(rand() * RAP_LINES.length);
  return Array.from({ length: 6 }, (_, k) => ({ voice, shift, rate: 3, text: RAP_LINES[(start + k) % RAP_LINES.length].replace('{title}', item.title) }));
}

module.exports = { episodeJobs, mixEpisode, rapJobs };
