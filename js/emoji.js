// Keyword → emoji sticker map used for "faceless" visual cues on each scene.

const MAP = {
  // science & space
  space: '🚀', rocket: '🚀', astronaut: '👩‍🚀', planet: '🪐', saturn: '🪐', jupiter: '🪐', mars: '🔴', earth: '🌍', world: '🌍',
  globe: '🌐', moon: '🌙', sun: '☀️', star: '⭐', stars: '✨', galaxy: '🌌', universe: '🌌', comet: '☄️', meteor: '☄️',
  asteroid: '☄️', telescope: '🔭', satellite: '🛰️', alien: '👽', ufo: '🛸', nasa: '🚀', gravity: '🍎', light: '💡',
  atom: '⚛️', physics: '⚛️', chemistry: '⚗️', science: '🔬', scientist: '🧑‍🔬', scientists: '🧑‍🔬', experiment: '🧪',
  lab: '🧪', research: '🔬', study: '📚', microscope: '🔬', dna: '🧬', gene: '🧬', genes: '🧬', cell: '🦠', cells: '🦠',
  virus: '🦠', bacteria: '🦠', magnet: '🧲', energy: '⚡', electricity: '⚡', battery: '🔋', volcano: '🌋', earthquake: '🌎',
  // body & health
  brain: '🧠', mind: '🧠', memory: '🧠', heart: '❤️', hearts: '❤️', blood: '🩸', bone: '🦴', bones: '🦴', eye: '👁️',
  eyes: '👀', ear: '👂', nose: '👃', tooth: '🦷', teeth: '🦷', muscle: '💪', muscles: '💪', strength: '💪', fitness: '🏋️',
  exercise: '🏃', workout: '🏋️', running: '🏃', walk: '🚶', walking: '🚶', sleep: '😴', dream: '💭', dreams: '💭',
  tired: '🥱', stress: '😰', anxiety: '😟', happy: '😊', happiness: '😊', sad: '😢', angry: '😠', fear: '😱',
  scared: '😱', love: '❤️', health: '🩺', doctor: '🩺', medicine: '💊', pill: '💊', hospital: '🏥', breath: '🌬️',
  breathing: '🌬️', meditation: '🧘', calm: '🧘', yoga: '🧘', water: '💧', hydration: '💧', skin: '🧴', hair: '💇',
  baby: '👶', babies: '👶', child: '🧒', children: '🧒', kids: '🧒', teen: '🧑', people: '👥', human: '🧍', humans: '🧍',
  // animals
  animal: '🐾', animals: '🐾', dog: '🐶', dogs: '🐶', puppy: '🐶', cat: '🐱', cats: '🐱', kitten: '🐱', octopus: '🐙',
  octopuses: '🐙', squid: '🦑', shark: '🦈', sharks: '🦈', whale: '🐋', whales: '🐋', dolphin: '🐬', dolphins: '🐬',
  fish: '🐟', turtle: '🐢', crab: '🦀', lobster: '🦞', jellyfish: '🪼', bird: '🐦', birds: '🐦', eagle: '🦅', owl: '🦉',
  parrot: '🦜', penguin: '🐧', penguins: '🐧', chicken: '🐔', duck: '🦆', bee: '🐝', bees: '🐝', honey: '🍯', ant: '🐜',
  ants: '🐜', butterfly: '🦋', spider: '🕷️', snake: '🐍', snakes: '🐍', lizard: '🦎', crocodile: '🐊', frog: '🐸',
  lion: '🦁', tiger: '🐯', bear: '🐻', panda: '🐼', koala: '🐨', monkey: '🐒', gorilla: '🦍', elephant: '🐘',
  elephants: '🐘', giraffe: '🦒', zebra: '🦓', horse: '🐴', cow: '🐄', pig: '🐷', sheep: '🐑', rabbit: '🐰', mouse: '🐭',
  rat: '🐀', wolf: '🐺', fox: '🦊', deer: '🦌', camel: '🐫', bat: '🦇', dinosaur: '🦖', dinosaurs: '🦖', dragon: '🐉',
  unicorn: '🦄', insect: '🐛', insects: '🐛', worm: '🪱', snail: '🐌',
  // nature & weather
  nature: '🌿', plant: '🌱', plants: '🌱', tree: '🌳', trees: '🌳', forest: '🌲', flower: '🌸', flowers: '🌸', leaf: '🍃',
  mountain: '⛰️', mountains: '🏔️', ocean: '🌊', oceans: '🌊', sea: '🌊', wave: '🌊', waves: '🌊', beach: '🏖️',
  island: '🏝️', desert: '🏜️', river: '🏞️', lake: '🏞️', rain: '🌧️', storm: '⛈️', thunder: '⚡', lightning: '⚡',
  snow: '❄️', ice: '🧊', cold: '🥶', hot: '🥵', heat: '🔥', fire: '🔥', wind: '🌬️', cloud: '☁️', clouds: '☁️',
  rainbow: '🌈', weather: '🌦️', climate: '🌡️', temperature: '🌡️', tornado: '🌪️', hurricane: '🌀',
  // food
  food: '🍔', eat: '🍽️', eating: '🍽️', meal: '🍽️', diet: '🥗', salad: '🥗', pizza: '🍕', burger: '🍔', fries: '🍟',
  coffee: '☕', caffeine: '☕', tea: '🍵', sugar: '🍬', candy: '🍬', chocolate: '🍫', cake: '🍰', cookie: '🍪',
  bread: '🍞', cheese: '🧀', egg: '🥚', eggs: '🥚', milk: '🥛', apple: '🍎', apples: '🍎', banana: '🍌', bananas: '🍌',
  orange: '🍊', lemon: '🍋', strawberry: '🍓', grapes: '🍇', watermelon: '🍉', avocado: '🥑', carrot: '🥕',
  vegetable: '🥦', vegetables: '🥦', fruit: '🍓', fruits: '🍓', meat: '🥩', steak: '🥩', rice: '🍚', noodles: '🍜',
  sushi: '🍣', taco: '🌮', spicy: '🌶️', pepper: '🌶️', salt: '🧂', wine: '🍷', beer: '🍺', drink: '🥤', cooking: '🍳',
  chef: '👨‍🍳', kitchen: '🍳', recipe: '📝',
  // money & business
  money: '💰', cash: '💵', dollar: '💵', dollars: '💵', rich: '🤑', wealth: '💎', wealthy: '💎', millionaire: '💰',
  billionaire: '💰', bank: '🏦', invest: '📈', investing: '📈', investment: '📈', stock: '📈', stocks: '📈',
  market: '📊', economy: '📊', price: '🏷️', prices: '🏷️', cost: '💸', expensive: '💸', cheap: '🪙', save: '🐷',
  saving: '🐷', savings: '🐷', debt: '📉', loss: '📉', profit: '📈', growth: '📈', business: '💼', company: '🏢',
  companies: '🏢', startup: '🚀', boss: '👔', job: '💼', jobs: '💼', work: '💼', career: '🧗', salary: '💵',
  marketing: '📣', sales: '🤝', deal: '🤝', crypto: '🪙', bitcoin: '🪙', gold: '🥇', diamond: '💎', diamonds: '💎',
  shopping: '🛍️', store: '🏪', brand: '🏷️', advertising: '📣', customer: '🧑‍💼', customers: '🧑‍💼',
  // tech
  technology: '💻', tech: '💻', computer: '💻', computers: '💻', laptop: '💻', phone: '📱', phones: '📱',
  smartphone: '📱', iphone: '📱', app: '📱', apps: '📱', internet: '🌐', online: '🌐', website: '🌐', web: '🌐',
  code: '👨‍💻', coding: '👨‍💻', programming: '👨‍💻', software: '💾', data: '📊', ai: '🤖', robot: '🤖', robots: '🤖',
  algorithm: '🧮', chip: '🔌', video: '🎬', videos: '🎬', camera: '📷', photo: '📸', photos: '📸', game: '🎮',
  games: '🎮', gaming: '🎮', email: '📧', password: '🔐', security: '🔒', hacker: '🕵️', hackers: '🕵️', wifi: '📶',
  social: '📲', tiktok: '🎵', youtube: '▶️', instagram: '📸', screen: '🖥️', screens: '🖥️', electric: '⚡', car: '🚗',
  cars: '🚗', tesla: '🚗',
  // transport & places
  plane: '✈️', planes: '✈️', flight: '✈️', airport: '✈️', train: '🚆', bus: '🚌', bike: '🚲', bicycle: '🚲', ship: '🚢',
  boat: '⛵', travel: '🧳', trip: '🧳', city: '🏙️', cities: '🏙️', house: '🏠', home: '🏠', building: '🏢',
  road: '🛣️', map: '🗺️', country: '🗺️', countries: '🗺️', japan: '🗾', egypt: '🏜️', pyramid: '🔺', pyramids: '🔺',
  castle: '🏰', bridge: '🌉', tower: '🗼', school: '🏫', university: '🎓', college: '🎓', library: '📚', church: '⛪',
  // history & society
  history: '📜', ancient: '🏺', king: '👑', queen: '👑', empire: '👑', war: '⚔️', battle: '⚔️', soldier: '🪖',
  army: '🪖', weapon: '🗡️', sword: '⚔️', pirate: '🏴‍☠️', pirates: '🏴‍☠️', law: '⚖️', court: '⚖️', crime: '🚨',
  police: '🚓', prison: '⛓️', vote: '🗳️', election: '🗳️', government: '🏛️', president: '🏛️', politics: '🏛️',
  religion: '🕊️', peace: '🕊️', mystery: '🕵️', secret: '🤫', secrets: '🤫', ghost: '👻', haunted: '👻', myth: '🧙',
  legend: '🧙', magic: '🪄', treasure: '💰', discovery: '🔎', discovered: '🔎', invention: '💡', inventor: '💡',
  idea: '💡', ideas: '💡',
  // learning, productivity & mind
  learn: '📚', learning: '📚', book: '📖', books: '📚', read: '📖', reading: '📖', write: '✍️', writing: '✍️',
  student: '🧑‍🎓', students: '🧑‍🎓', teacher: '🧑‍🏫', exam: '📝', test: '📝', math: '🧮', number: '🔢',
  numbers: '🔢', language: '🗣️', languages: '🗣️', english: '🗣️', words: '🔤', word: '🔤', speak: '🗣️',
  talk: '🗣️', question: '❓', questions: '❓', answer: '✅', truth: '✅', lie: '🤥', lies: '🤥', fact: '📌', facts: '📌',
  habit: '🔁', habits: '🔁', routine: '📅', time: '⏰', clock: '⏰', morning: '🌅', night: '🌙', day: '☀️',
  focus: '🎯', goal: '🎯', goals: '🎯', success: '🏆', successful: '🏆', win: '🏆', winner: '🏆', champion: '🏆',
  fail: '❌', failure: '❌', mistake: '⚠️', mistakes: '⚠️', danger: '⚠️', dangerous: '☠️', warning: '⚠️',
  risk: '⚠️', motivation: '🔥', discipline: '🧱', confidence: '😎', productivity: '⚡', productive: '⚡',
  plan: '🗒️', list: '📋', checklist: '✅', tip: '💡', tips: '💡', hack: '🛠️', hacks: '🛠️', tool: '🛠️', tools: '🛠️',
  friend: '🤝', friends: '🤝', friendship: '🤝', family: '👨‍👩‍👧', mother: '👩', mom: '👩', father: '👨', dad: '👨',
  relationship: '💞', relationships: '💞', dating: '💘', marriage: '💍', wedding: '💍', smile: '😁', laugh: '😂',
  funny: '😂', weird: '🤪', crazy: '🤯', amazing: '🤩', surprising: '😮', shocking: '😱', record: '🏅',
  // arts & fun
  music: '🎵', song: '🎶', songs: '🎶', guitar: '🎸', piano: '🎹', art: '🎨', artist: '🎨', painting: '🖼️',
  movie: '🎬', movies: '🎬', film: '🎬', tv: '📺', theater: '🎭', dance: '💃', party: '🎉', gift: '🎁',
  birthday: '🎂', holiday: '🏖️', christmas: '🎄', halloween: '🎃', sport: '⚽', sports: '⚽', football: '🏈',
  soccer: '⚽', basketball: '🏀', tennis: '🎾', olympics: '🥇', medal: '🥇', chess: '♟️', puzzle: '🧩', luck: '🍀',
  lucky: '🍀', dice: '🎲', fashion: '👗', clothes: '👕', shoes: '👟', beauty: '💄', color: '🎨', colors: '🌈',
  speed: '⚡', fast: '⚡', slow: '🐢', big: '🐘', biggest: '🏔️', largest: '🏔️', small: '🔬', tiny: '🔬', smallest: '🔬',
  first: '🥇', oldest: '⏳', future: '🔮', past: '⏳', years: '⏳', century: '⏳', death: '💀',
  dead: '💀', die: '💀', life: '🌱', alive: '🌱', grow: '🌱', growing: '🌱', change: '🔄', new: '🆕', free: '🆓',
  power: '⚡', powerful: '💥', explosion: '💥', bomb: '💣', key: '🔑', door: '🚪', lock: '🔒', paper: '📄',

};

const IRREGULAR = { mice: 'mouse', geese: 'goose', teeth: 'tooth', feet: 'foot', people: 'people', children: 'children', men: 'man', women: 'woman' };

export function emojiFor(word) {
  if (!word) return '';
  const w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  if (MAP[w]) return MAP[w];
  if (IRREGULAR[w] && MAP[IRREGULAR[w]]) return MAP[IRREGULAR[w]];
  const candidates = [];
  if (w.endsWith('ies')) candidates.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) candidates.push(w.slice(0, -2));
  if (w.endsWith('s')) candidates.push(w.slice(0, -1));
  if (w.endsWith('ing')) candidates.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  if (w.endsWith('ed')) candidates.push(w.slice(0, -2), w.slice(0, -1));
  for (const c of candidates) if (MAP[c]) return MAP[c];
  return '';
}

// Best emoji for a sentence: tries the scene keyword first, then every word.
export function emojiForText(text, keyword) {
  const k = emojiFor(keyword);
  if (k) return k;
  const words = String(text || '').toLowerCase().match(/[a-z]+/g) || [];
  // prefer longer, more specific words
  const sorted = [...new Set(words)].filter((w) => w.length > 2).sort((a, b) => b.length - a.length);
  for (const w of sorted) {
    const e = emojiFor(w);
    if (e) return e;
  }
  return '';
}

export const EMOJI_PICKS = ['🔥', '💡', '🤯', '😮', '✅', '❌', '⚠️', '💰', '📈', '🧠', '❤️', '⭐', '🚀', '🌍', '⏰', '🎯', '🏆', '😂', '🤫', '👀', '💪', '🐙', '🌊', '🍕', '☕', '📚', '🤖', '🎵'];
