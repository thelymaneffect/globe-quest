/* Lyman Learning: Globe Quest Geography Game — game logic & UI */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const SAVE_KEY = (m) => 'lymanWD_save_' + m;
  const SET_KEY = 'lymanWD_settings';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  const PLAYER_COLORS = [
    ['Red', '#e2483d'], ['Royal Blue', '#2f5fd0'], ['Purple', '#8a3fc7'], ['Orange', '#f07c1b'],
    ['Teal', '#0f9c95'], ['Gold', '#e8b007'], ['Pink', '#e0408f'], ['Forest Green', '#2a8a3e']
  ];
  // soft "map" colors for computer empires — neighbors get different colors
  const AI_COLORS = ['#f6d7a7', '#cfe3b5', '#f3c4c4', '#c9d8ef', '#e6cfe8', '#f8e6a0', '#bfe3dc', '#f2d0b5', '#d8d3ec', '#e9e3c4'];

  const MODES = {
    world: {
      key: 'world', title: 'World Mode', unit: 'country', units: 'countries',
      scripts: ['data/world.js', 'data/world-meta.js', 'data/info-africa.js', 'data/info-asia.js', 'data/info-europe.js', 'data/info-americas-oceania.js', 'data/extras.js', 'data/nature.js', 'data/pictures.js', 'data/local-names.js', 'data/place-pics.js'],
      geo: () => window.GEO_WORLD, obj: 'countries', info: () => window.INFO,
      flag: (c) => `flags/${c.toLowerCase()}.svg`
    },
    us: {
      key: 'us', title: 'USA Mode', unit: 'state', units: 'states',
      scripts: ['data/us.js', 'data/info-us.js', 'data/extras.js', 'data/nature.js', 'data/world.js', 'data/world-meta.js', 'data/flowers-us.js', 'data/pictures.js', 'data/place-pics.js'],
      geo: () => window.GEO_US, obj: 'states', info: () => window.INFO_US,
      flag: (c) => `flags/us/${window.INFO_US[c][0].toLowerCase().replace(/ /g, '-')}.svg`
    }
  };
  const DETAIL_SCRIPTS = ['data/places.js', 'data/cities.js', 'data/rivers.js', 'data/lakes.js', 'data/features.js'];

  let settings = Object.assign({ sound: true, view: '2d', legendOpen: window.innerWidth > 900, stakes: 'none', guides: true }, store.get(SET_KEY) || {});
  if (!Array.isArray(settings.cats)) settings.cats = settings.level === 'off' || settings.boost === false ? [] : ['capitals', 'orientation', 'landmarks'];
  if (settings.catsV !== 2) { if (settings.cats.length && !settings.cats.includes('orientation')) settings.cats.splice(1, 0, 'orientation'); settings.catsV = 2; }
  const saveSettings = () => store.set(SET_KEY, settings);

  let M = null;      // current mode def
  let S = null;      // game state (saved)
  let map = null;    // GameMap
  let regions = [];  // playable region codes
  let colorAI = {};  // empire -> color

  /* ---------------- script loading ---------------- */
  const loaded = new Set();
  function loadScript(src) {
    if (loaded.has(src)) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = () => { loaded.add(src); res(); }; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  const loadAll = (list) => Promise.all(list.map(loadScript));

  /* ---------------- sound (no files needed) ---------------- */
  // Phones and tablets pause the sound player while Read Aloud talks or the app is in the background.
  // Sounds asked for during a pause are DROPPED (never saved up to blast out on the next tap),
  // and any still-playing sounds are cleared when a battle opens or a popup closes.
  let actx = null; const liveTones = new Set();
  function audio() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    if (actx.state !== 'running') actx.resume().catch(() => {});
    return actx;
  }
  let soundToken = 0; // bumping this cancels any sound sequence still waiting to play
  function stopAllSounds() {
    soundToken++;
    for (const o of liveTones) { try { o.stop(); } catch (e) { /* already stopped */ } }
    liveTones.clear();
  }
  // play a series of notes live, one at a time; nothing is lined up in advance,
  // so a paused or cancelled sequence can never play later by surprise
  function sequence(notes, keepGoing = () => true) {
    const tok = soundToken;
    for (const [delay, args] of notes) setTimeout(() => { if (tok === soundToken && keepGoing()) tone(...args); }, delay * 1000);
  }
  function tone(freq, dur, type = 'sine', vol = 0.15, when = 0) {
    if (!settings.sound) return;
    const ac = audio(); if (!ac || ac.state !== 'running') return; // paused: skip this sound instead of queueing it
    try {
      const t0 = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
      liveTones.add(o); o.onended = () => liveTones.delete(o);
    } catch (e) { /* audio unavailable */ }
  }
  // wake the sound player on the first tap so the very first sounds aren't skipped
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { if (settings.sound) audio(); }, { capture: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAllSounds(); });
  const sfx = {
    click: () => tone(660, 0.08, 'triangle', 0.08),
    // wheel ticks only play while the spinning wheel is actually on screen
    spin: () => { let t = 0; const notes = []; for (let i = 0; i < 34; i++) { notes.push([t, [1100, 0.03, 'square', 0.04]]); t += 0.035 + i * i * 0.00028; } sequence(notes, () => !!document.querySelector('#wheel') && !modal.hidden); },
    win: () => sequence([523, 659, 784, 1047].map((f, i) => [i * 0.12, [f, 0.35, 'triangle', 0.14]])),
    lose: () => sequence([392, 330, 262, 196].map((f, i) => [i * 0.16, [f, 0.4, 'sawtooth', 0.06]])),
    right: () => sequence([660, 880].map((f, i) => [i * 0.1, [f, 0.2, 'triangle', 0.12]])),
    wrong: () => tone(180, 0.35, 'square', 0.06)
  };

  /* ---------------- helpers ---------------- */
  // a photo next to the words (always shown) — animals, birds, flowers and types of land
  const placePic = (c, cls = 'pic') => { const f = window.PLACE_PICS && window.PLACE_PICS[(M && M.key === 'us' ? 'us:' : 'w:') + c]; return f ? `<img class="${cls}" src="${f}" alt="" loading="lazy">` : ''; };
  const pic = (name, cls = 'pic') => { const f = window.PICS && window.PICS[name]; return f ? `<img class="${cls}" src="${f}" alt="${String(name).replace(/"/g, '')}" loading="lazy">` : ''; };
  const info = (c) => M.info()[c];
  const nameOf = (c) => (info(c) ? info(c)[0] : c);
  const shortCap = (c) => info(c)[1].split(/ \(|;|,/)[0].trim();
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || 'th');
  function fmtPop(m) {
    if (m >= 1000) return `about ${(m / 1000).toFixed(m >= 1395 ? 1 : 2).replace(/\.?0+$/, '')} billion`;
    if (m >= 10) return `about ${Math.round(m)} million`;
    if (m >= 1) return `about ${(Math.round(m * 10) / 10)} million`;
    const n = m * 1e6; const r = n >= 100000 ? Math.round(n / 10000) * 10000 : n >= 10000 ? Math.round(n / 1000) * 1000 : Math.round(n / 100) * 100;
    return `about ${r.toLocaleString()}`;
  }
  const regionsOf = (emp) => regions.filter((r) => S.own[r] === emp);
  const empires = () => { const m = new Map(); for (const r of regions) { const e = S.own[r]; m.set(e, (m.get(e) || 0) + 1); } return m; };
  const empireLabel = (e) => { const n = regionsOf(e).length; return n > 1 ? `${nameOf(e)}’s empire` : nameOf(e); };
  // Bold, one-of-a-kind colors for computer empires once they own more than one place,
  // so it's easy to see who took over what. (Free places keep the soft map colors.)
  const EMPIRE_COLORS = ['#d1495b', '#00798c', '#e09f3e', '#4f9d69', '#8d6cab', '#2e86ab', '#c06c84', '#bc6c25', '#3a5a40', '#9c6644', '#5e60ce', '#e76f51', '#118ab2', '#a4133c', '#6a994e', '#7b2cbf'];
  const nearColor = (a, b) => { const x = d3.rgb(a), y = d3.rgb(b); return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b) < 110; };
  function empireColor(e) {
    S.empColor = S.empColor || {};
    if (S.empColor[e] && S.color && e !== S.player && nearColor(S.empColor[e], S.color)) delete S.empColor[e]; // too close to yours: pick another
    if (!S.empColor[e]) {
      const used = new Set(Object.values(S.empColor));
      const near = nearColor;
      const ok = EMPIRE_COLORS.filter((c) => !S.color || !near(c, S.color));
      S.empColor[e] = ok.find((c) => !used.has(c)) || ok[Object.keys(S.empColor).length % ok.length];
    }
    return S.empColor[e];
  }
  const empireSize = (e) => { let n = 0; for (const r of regions) if (S.own[r] === e) n++; return n; };
  const REGION_FILL = { Northeast: ['#a9c8ec', '#94b9e4'], Midwest: ['#f5d98c', '#efcd73'], South: ['#f4b49a', '#efa184'], West: ['#b4dca6', '#a2d293'] };
  const colorOf = (r) => {
    if (S && S.phase === 'explore' && M.key === 'us' && settings.guides && US_REGION[r]) return REGION_FILL[US_REGION[r]][r.charCodeAt(1) % 2];
    const e = S && S.own ? S.own[r] : r;
    if (S && S.player && e === S.player) return S.color;
    if (S && S.own && empireSize(e) > 1) return empireColor(e);
    return colorAI[e] || '#e4ddd0';
  };

  /* ---------------- modal ---------------- */
  const modal = $('#modal'), card = $('#modalCard');
  let modalOnClose = null;
  function openModal(html, opts = {}) {
    card.className = 'modal-card' + (opts.wide ? ' wide' : '');
    card.innerHTML = (opts.noClose ? '' : '<button class="close-x" data-close aria-label="Close">×</button>') + html;
    modal.hidden = false; modalOnClose = opts.onClose || null; card.scrollTop = 0;
    card.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  }
  function closeModal() { modal.hidden = true; card.innerHTML = ''; stopSpeech(); stopAllSounds(); if (window.__pendingUpdate) { location.reload(); return; } const f = modalOnClose; modalOnClose = null; f && f(); }
  modal.addEventListener('click', (e) => { if (e.target === modal && !card.querySelector('[data-lock]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden && !card.querySelector('[data-lock]')) closeModal(); });

  /* ---------------- speech: a friendly narrator ----------------
     Uses voices stored on the device (they work in airplane mode). The narrator speaks clear English
     in the closest regional accent, and local greetings are spoken by a native voice when the device has one.
     Each sentence is its own utterance with small natural changes in pitch and pace. */
  const NOVELTY = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley/i;
  const normLang = (l) => (l || '').replace('_', '-').toLowerCase();
  function pickVoice(prefs, strict) {
    if (!('speechSynthesis' in window)) return null;
    const all = speechSynthesis.getVoices();
    const local = all.filter((v) => v.localService);
    const pool = local.length ? local : all;
    const score = (v) => (/Premium|Enhanced|Neural|Natural/i.test(v.name) ? 6 : 0) + (/Siri/i.test(v.name) ? 3 : 0) + (v.localService ? 2 : 0) - (NOVELTY.test(v.name) ? 50 : 0);
    for (const p of prefs) {
      const want = p.toLowerCase();
      const hits = pool.filter((v) => (want.includes('-') ? normLang(v.lang) === want : normLang(v.lang).split('-')[0] === want));
      if (hits.length) return hits.sort((a, b) => score(b) - score(a))[0];
    }
    if (strict) return null;
    const en = pool.filter((v) => /^en/i.test(v.lang)).sort((a, b) => score(b) - score(a));
    return en[0] || null;
  }
  // closest English accent for each part of the world
  function accentFor(r) {
    if (!M || M.key === 'us') return ['en-US'];
    const by = { GB: ['en-GB'], IE: ['en-IE', 'en-GB'], AU: ['en-AU'], NZ: ['en-NZ', 'en-AU'], ZA: ['en-ZA'], CA: ['en-CA', 'en-US'], US: ['en-US'],
      IN: ['en-IN'], PK: ['en-IN'], BD: ['en-IN'], LK: ['en-IN'], NP: ['en-IN'], BT: ['en-IN'], MV: ['en-IN'], SG: ['en-SG', 'en-GB'], PH: ['en-PH', 'en-US'],
      NG: ['en-NG', 'en-GB'], GH: ['en-GH', 'en-NG', 'en-GB'], KE: ['en-KE', 'en-TZ', 'en-GB'], TZ: ['en-TZ', 'en-KE', 'en-GB'], UG: ['en-UG', 'en-KE', 'en-GB'] };
    if (by[r]) return [...by[r], 'en-GB', 'en-US'];
    const m = window.WORLD_META[r] || {};
    if (m.region === 'Africa') return ['ZW', 'ZM', 'MW', 'MZ', 'BW', 'NA', 'LS', 'SZ'].includes(r) ? ['en-ZA', 'en-GB'] : ['en-NG', 'en-KE', 'en-GB'];
    if (m.region === 'Oceania') return ['en-AU', 'en-NZ', 'en-GB'];
    if (m.region === 'Europe') return ['en-GB', 'en-IE'];
    if (m.region === 'Asia') return m.sub === 'Southern Asia' ? ['en-IN', 'en-GB'] : ['en-GB', 'en-AU'];
    if (m.region === 'Americas') return m.sub === 'Caribbean' ? ['en-JM', 'en-TT', 'en-GB', 'en-US'] : ['en-US'];
    return ['en-GB', 'en-US'];
  }
  // speech codes for greeting languages (only used when the device has that voice)
  const LANG_CODES = { Arabic: ['ar-SA', 'ar'], 'Tunisian Arabic': ['ar-TN', 'ar'], French: ['fr-FR', 'fr'], Spanish: ['es-ES', 'es'], Portuguese: ['pt-PT', 'pt'],
    German: ['de-DE', 'de'], 'Austrian German': ['de-AT', 'de'], 'Swiss German': ['de-CH', 'de'], 'Liechtenstein German': ['de-CH', 'de'], Italian: ['it'], Dutch: ['nl'],
    Swedish: ['sv'], Norwegian: ['nb', 'no'], Danish: ['da'], Finnish: ['fi'], Polish: ['pl'], Czech: ['cs'], Slovak: ['sk'], Hungarian: ['hu'], Romanian: ['ro'],
    Ukrainian: ['uk'], Russian: ['ru'], Bulgarian: ['bg'], Croatian: ['hr'], Serbian: ['sr'], Montenegrin: ['sr', 'hr'], Bosnian: ['bs', 'hr'], Slovene: ['sl'],
    Greek: ['el'], Turkish: ['tr'], Hebrew: ['he'], Persian: ['fa'], Dari: ['fa'], Hindi: ['hi'], Bengali: ['bn'], Urdu: ['ur'], Thai: ['th'], Vietnamese: ['vi'],
    Indonesian: ['id'], Malay: ['ms'], Mandarin: ['zh-CN', 'zh'], Japanese: ['ja'], Korean: ['ko'], Catalan: ['ca'], Swahili: ['sw'], Afrikaans: ['af'], Zulu: ['zu'],
    Filipino: ['fil', 'tl'], Icelandic: ['is'], Irish: ['ga'], Lithuanian: ['lt'], Latvian: ['lv'], Estonian: ['et'], Albanian: ['sq'], Macedonian: ['mk'],
    Belarusian: ['be'], Kazakh: ['kk'], Uzbek: ['uz'], Georgian: ['ka'], Armenian: ['hy'], Azerbaijani: ['az'], Nepali: ['ne'], Sinhala: ['si'], Khmer: ['km'],
    Lao: ['lo'], Burmese: ['my'], Mongolian: ['mn'], Amharic: ['am'], Somali: ['so'], Hausa: ['ha'], Yoruba: ['yo'], Māori: ['mi'], Maltese: ['mt'], Luxembourgish: ['lb'] };
  const LOCAL_VARIANT = { BR: { Portuguese: ['pt-BR', 'pt'] }, CA: { French: ['fr-CA', 'fr'] }, TW: { Mandarin: ['zh-TW', 'zh'] }, BE: { French: ['fr-BE', 'fr'], Dutch: ['nl-BE', 'nl'] }, CH: { French: ['fr-CH', 'fr'] } };
  function greetingVoice(r, lang) {
    if (/English|Patois/.test(lang)) return null; // the narrator says these
    let codes = (LOCAL_VARIANT[r] || {})[lang] || LANG_CODES[lang];
    if (lang === 'Spanish' && r !== 'ES') codes = ['es-MX', 'es-US', 'es-419', 'es'];
    return codes ? pickVoice(codes, true) : null;
  }
  // parse "Bonjour (French)" or "Hello / Bonjour (English / French)" into pairs
  function greetingsOf(r) {
    const raw = info(r)[4] || ''; const m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    const words = (m ? m[1] : raw).split(' / '), langs = (m ? m[2].split(/,|“/)[0] : '').split(' / ').map((s) => s.trim());
    return words.map((w, i) => ({ word: w.trim(), lang: langs[i] || langs[0] || '' }));
  }
  const listJoin = (arr) => (arr.length < 2 ? arr.join('') : arr.length === 2 ? `${arr[0]} and ${arr[1]}` : arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1]);
  // add "the" where English needs it: "the Eiffel Tower", "the Naadam festival" — but "Mount Fuji", "Victoria Falls"
  const NEEDS_THE_PLACE = /\bof\b|(Towers?|House|Canal|Hills|Islands|Desert|Mountains|Lagoon|Lakes|Delta|Gardens|Building|Dunes|Peaks|highlands|Plateau rock arches|Sculpture Park|Grand Palace in Bangkok|Wall of China|Sundarbans mangrove forest|Maasai Mara|Taj Mahal|Burj Khalifa|Atomium|Parthenon|Sistine Chapel|Kokoda Track|French Quarter in New Orleans|Space Needle|Liberty Bell|Gateway Arch|Hoover Dam|Mall of America|Golden Gate Bridge|U\.S\. Space & Rocket Center|Kennedy Space Center|Rock and Roll Hall of Fame|Indianapolis Motor Speedway|Atlantic City boardwalk|International Peace Garden|Mississippi River|Great Smoky Mountains|Great Blue Hole|Underwater Sculpture Park|Boiling Lake|Tree of Life|Eye of the Sahara|Sudd wetland|Gobi Desert|Pamir Mountains|Pyrenees ski slopes|Rock Islands|Funafuti Lagoon|Prince’s Palace|ICEHOTEL|Hill of Crosses|Bay of Kotor|Seven Coloured Earths|Avenue of the Baobabs|Kinderdijk windmills|Svaneti stone towers|Fiat Tagliero airplane building|Basilica of Our Lady of Peace|Church of the Nativity|Museum of Islamic Art|Ziggurat of Ur|Registan Square|Chocolate Hills|Old Faithful geyser|Redeemer statue|Apostle Islands|Field of Dreams|Tallgrass Prairie|Newport mansions|Covered bridges)$/;
  const NEEDS_THE_THING = /\bof\b|(festival|dance|drummers|race|party|trail|express|guard|games|palace|ceremony|didgeridoo|piano|flute|fiddle\)|necktie)$/i;
  const withThe = (s, re) => (/^(The|the|A|An) /.test(s) || /, the /.test(s) || !re.test(s) ? s : 'the ' + s);
  const forSpeech = (s) => String(s).replace(/\s*\(([^)]*)\)/g, ', $1,').replace(/,\s*,/g, ',').replace(/,\s*([.!?])/g, '$1').replace(/[“”]/g, '"').trim().replace(/,$/, '');
  // queue a list of lines: [{ text, mood: 'excited'|'question'|'calm', voice }]
  let speechId = 0, onSpeechDone = null, peekingMap = false;
  function speakLines(lines, defaultVoice, done) {
    if (!('speechSynthesis' in window)) return;
    stopSpeech(); const myId = ++speechId; onSpeechDone = done || null;
    const jitter = (n) => (Math.random() * 2 - 1) * n;
    lines.forEach((ln, i) => {
      const u = new SpeechSynthesisUtterance(ln.text);
      const v = ln.voice || defaultVoice; if (v) { u.voice = v; u.lang = v.lang; }
      const mood = ln.mood || (/[!]$/.test(ln.text) ? 'excited' : /[?]$/.test(ln.text) ? 'question' : 'calm');
      u.rate = ({ excited: 1.0, question: 0.96, calm: 0.94, word: 0.82 }[mood] || 0.94) + jitter(0.03);
      u.pitch = ({ excited: 1.14, question: 1.08, calm: 1.0, word: 1.05 }[mood] || 1) + jitter(i % 2 ? 0.05 : 0.03);
      u.volume = 1;
      if (i === lines.length - 1) u.onend = u.onerror = () => { if (myId === speechId) { const f = onSpeechDone; onSpeechDone = null; f && f(); } };
      if (myId === speechId) speechSynthesis.speak(u);
    });
  }
  function speak(text, voice) { speakLines(String(text).match(/[^.!?]+[.!?]+["”]?|[^.!?]+$/g).map((t) => ({ text: t.trim() })).filter((l) => l.text), voice || pickVoice(['en-US'])); }
  function stopSpeech() {
    speechId++;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const f = onSpeechDone; onSpeechDone = null; f && f();
  }

  function sayHello(r) {
    const narrator = pickVoice(accentFor(r));
    const lines = [];
    for (const g of greetingsOf(r)) {
      const v = greetingVoice(r, g.lang);
      lines.push({ text: g.word.replace(/[.!?]*$/, '') + '!', voice: v || narrator, mood: v ? 'word' : 'excited' });
    }
    speakLines(lines, narrator);
  }

  /* ---------------- confetti ---------------- */
  function confetti(n = 120) {
    const box = $('#confetti'); const cols = ['#e2483d', '#f2b632', '#2f6fd6', '#2e9e5b', '#8a3fc7', '#e0408f'];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.style.left = Math.random() * 100 + 'vw'; el.style.background = pick(cols);
      el.style.animationDuration = 1.8 + Math.random() * 1.8 + 's'; el.style.animationDelay = Math.random() * 0.6 + 's';
      box.appendChild(el); setTimeout(() => el.remove(), 4200);
    }
  }

  /* ================= SUPPORT & GAME REQUESTS ================= */
  const cfg = () => window.LYMAN_CONFIG || {};
  function supportHTML() {
    return `<div class="support"><p>These games are free, with no ads. Your support helps us create more games and give your family even more ways to learn and play!</p>
      <div class="support-row"><button class="btn support-btn" data-support>💛 Support us</button><button class="btn request-btn" data-request>💡 Request a game</button></div>
      <p class="small"><a href="#" data-credits>📷 Photo credits</a></p></div>`;
  }
  function showSupport() {
    const c = cfg();
    const paras = (c.supportMessage || '').split(/\n\n+/).map((t) => `<p>${esc(t)}</p>`).join('');
    const sign = esc(c.supportSignoff || '').replace(/\n/g, '<br>');
    const btns = [c.paypalUrl && `<a class="btn pay paypal" href="${esc(c.paypalUrl)}" target="_blank" rel="noopener">Give with PayPal</a>`,
      c.squareUrl && `<a class="btn pay square" href="${esc(c.squareUrl)}" target="_blank" rel="noopener">Give with Square</a>`].filter(Boolean).join('');
    openModal(`<h3 class="mtitle">💛 Support Lyman Learning</h3><div class="support-msg">${paras}<p class="signoff">${sign}</p></div>
      <div class="pay-row">${btns || '<p class="small center">Donation links coming soon!</p>'}</div>
      ${navigator.onLine ? '' : '<p class="small center" style="margin-top:10px">✈️ You’re offline right now — donating needs the internet, so you can do it later.</p>'}`);
  }
  function showRequest() {
    openModal(`<h3 class="mtitle">💡 Request a New Game</h3>
      <form id="reqForm" class="req-form">
        <label for="reqIdea">What game would you like us to make?</label>
        <textarea id="reqIdea" name="idea" rows="4" maxlength="2000" required placeholder="Tell us your idea…"></textarea>
        <label for="reqEmail">Your email <span class="opt">(optional)</span></label>
        <p class="hint">If we have questions about the details, we can email you so we design it just the way you like. Or stay anonymous and we’ll use our creativity!</p>
        <input id="reqEmail" name="email" type="email" maxlength="200" placeholder="you@example.com" autocomplete="email">
        <div id="reqMsg" class="req-msg"></div>
        <div class="btn-row"><button class="btn ghost" type="button" data-close>Cancel</button><button class="btn go" type="submit" id="reqSend">Send my idea</button></div>
      </form>`);
    $('#reqForm').onsubmit = async (e) => {
      e.preventDefault();
      const idea = $('#reqIdea').value.trim(), email = $('#reqEmail').value.trim(), msg = $('#reqMsg');
      if (!idea) return;
      const key = cfg().web3formsKey;
      const url = key ? 'https://api.web3forms.com/submit' : cfg().requestFormEndpoint;
      if (!url) { msg.textContent = 'Sorry — this form isn’t connected yet. Please check back soon!'; return; }
      if (!navigator.onLine) { msg.textContent = 'You’re offline (airplane mode). Please send your idea next time you’re connected to the internet!'; return; }
      $('#reqSend').disabled = true; msg.textContent = 'Sending…';
      try {
        const body = key ? { access_key: key, subject: 'New game request (Lyman Learning)', from_name: 'Lyman Learning game request', idea }
          : { idea, _subject: 'New game request (Lyman Learning)' };
        if (email) { body.email = email; if (!key) body._replyto = email; }
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('send failed');
        $('#reqForm').innerHTML = '<div class="req-done">🎉 Thank you! We got your idea.</div><div class="btn-row"><button class="btn gold" type="button" data-close>Close</button></div>';
        card.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', closeModal));
      } catch (err) { msg.textContent = 'Hmm, that didn’t send. Please try again in a minute.'; $('#reqSend').disabled = false; }
    };
  }
  async function showCredits() {
    for (const f of ['data/pictures.js', 'data/place-pics.js', 'data/park-pics.js']) { try { await loadScript(f); } catch (e) { /* offline and not saved yet */ } }
    const list = [...(window.PIC_CREDITS || []), ...(window.PLACE_CREDITS || []), ...(window.PARK_CREDITS || []).map((c) => [c[0] + ' National Park', ...c.slice(1)])].sort((a, b) => a[0].localeCompare(b[0]));
    openModal(`<h3 class="mtitle">📷 Photo credits</h3>
      <p class="center small">Thank you to the photographers who share their pictures on Wikimedia Commons. Tap a name to see the original photo and its license.</p>
      <ul class="credits">${list.map(([name, , artist, lic, url]) => `<li><b>${esc(name)}</b>: photo by ${esc(artist)} (${esc(lic)}) ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">source</a>` : ''}</li>`).join('')}</ul>
      <p class="center small">Map data: Natural Earth (public domain). Flags: flag-icons (MIT) and Wikimedia Commons.</p>
      <div class="btn-row"><button class="btn gold" data-close>Close</button></div>`, { wide: true });
  }
  document.addEventListener('click', (e) => {
    const pl = e.target.closest('[data-park]');
    if (pl) { const pk = (window.PARKS || []).find((x) => x[0] === pl.dataset.park); if (pk) { closeModal(); showPark(pk, pl.dataset.from); } return; }
    if (e.target.closest('[data-credits]')) { e.preventDefault(); sfx.click(); showCredits(); return; }
    if (e.target.closest('[data-support]')) { sfx.click(); showSupport(); }
    else if (e.target.closest('[data-request]')) { sfx.click(); showRequest(); }
  });

  /* ================= COMPASS ================= */
  function updateCompass() {
    const el = $('#compassRose'); if (!el || !map) return;
    el.style.transform = `rotate(${-map.northAngle()}deg)`;
  }

  /* ================= TITLE SCREEN ================= */
  function showTitle() {
    $('#title').hidden = false; $('#hud').hidden = true; $('#mapwrap').hidden = true; updateInstallBtn(); if (typeof updateOfflineBadge === 'function') updateOfflineBadge();
    const box = $('#continueBox'); box.innerHTML = '';
    for (const k of ['world', 'us']) {
      const sv = store.get(SAVE_KEY(k));
      if (sv && sv.phase && sv.phase !== 'over') {
        const total = Object.keys(sv.own || {}).length;
        const mine = sv.player ? Object.values(sv.own).filter((e) => e === sv.player).length : 0;
        const b = document.createElement('button'); b.className = 'continue-btn';
        b.innerHTML = `▶ Continue ${MODES[k].title}<small>${sv.phase === 'pick' ? 'Choosing a country' : `${mine} of ${total} ${MODES[k].units} • 💪 ${sv.comebacks || 0} comebacks`}</small>`;
        b.onclick = () => { sfx.click(); startMode(k, sv); };
        box.appendChild(b);
      }
    }
    renderLevelPicker($('#levelPick')); renderStakesPicker($('#stakesPick')); $('#setSound').checked = settings.sound;
    $('#supportTitle').innerHTML = supportHTML();
    const url = (window.LYMAN_CONFIG || {}).companyUrl;
    $('#siteFooter').innerHTML = `Created by ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">The Lyman Effect, LLC</a>` : 'The Lyman Effect, LLC'}`;
  }
  document.querySelectorAll('.mode-card[data-mode]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.mode; sfx.click();
    const sv = store.get(SAVE_KEY(k));
    if (sv && sv.phase && sv.phase !== 'over' && sv.phase !== 'pick') {
      openModal(`<h3 class="mtitle">Start over?</h3><p class="center">You already have a ${MODES[k].title} game going. Starting a new one will erase it.</p>
        <div class="btn-row"><button class="btn ghost" id="mKeep">Keep playing it</button><button class="btn primary" id="mNew">Start new game</button></div>`);
      $('#mKeep').onclick = () => { closeModal(); startMode(k, sv); };
      $('#mNew').onclick = () => { closeModal(); store.del(SAVE_KEY(k)); startMode(k, null); };
    } else startMode(k, null);
  }));
  /* ================= EXPLORE THE WORLD (no game) ================= */
  // Types of Maps: each little map is drawn live from the world data, so it works offline.
  const MAP_TYPES = [
    { name: 'Mercator map', make: () => d3.geoMercator(), clipLat: 80,
      text: 'Keeps <b>angles and shapes</b> correct, so a straight line on this map is a steady compass direction. Sailors have used it to <b>navigate</b> for over 450 years, and phone maps use it too. But it stretches places near the poles. Greenland looks as big as Africa!' },
    { name: 'Equal-area map', make: () => d3.geoEqualEarth(),
      text: 'Shows every country at its <b>true size</b> compared to the others. Look how small Greenland really is next to Africa! Shapes get a little squished, but the sizes are fair, so it is great for <b>comparing sizes</b>.' },
    { name: 'Compromise map', make: () => d3.geoNaturalEarth1(),
      text: '<b>Balances size and shape</b>, so nothing looks too stretched or too squished. Nothing is perfect, but everything is close. Atlases and wall maps often use this kind, and it is the <b>2D Map</b> in Globe Quest.' },
    { name: 'Grid map (equirectangular)', make: () => d3.geoEquirectangular(),
      text: 'The lines of <b>latitude and longitude</b> make perfect squares. It is the simplest world map to make, so computers use it for <b>satellite pictures and weather maps</b>. Places near the poles get stretched sideways.' },
    { name: 'Globe view (orthographic)', make: () => d3.geoOrthographic().rotate([-20, -10]),
      text: 'Shows Earth the way it looks <b>from space</b>. Shapes and sizes are right near the middle, but you can only see <b>half of the world</b> at a time. This is the <b>3D Globe</b> in Globe Quest.' },
    { name: 'Polar map (azimuthal equidistant)', make: () => d3.geoAzimuthalEquidistant().rotate([0, -90]).clipAngle(150),
      text: 'Looks straight down on the <b>North Pole</b>. <b>Distances and directions from the center</b> are correct, so pilots use maps like this to plan flights over the Arctic. The <b>United Nations flag</b> uses one.' }
  ];
  const isAfrica = (id) => ((window.WORLD_META || {})[id] || {}).region === 'Africa';
  function drawMapType(canvas, T, land) {
    const w = canvas.clientWidth || 300, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const p = T.make(); let h, frame;
    if (T.clipLat) { // Mercator never reaches the poles, so show it from 84°N to 80°S
      p.scale((w - 8) / (2 * Math.PI)).translate([w / 2, 0]);
      const top = p([0, 84])[1], bot = p([0, -T.clipLat])[1];
      p.translate([w / 2, 4 - top]); h = Math.ceil(bot - top + 8);
      frame = (ctx) => ctx.rect(4, 4, w - 8, h - 8);
    } else {
      p.fitWidth(w - 8, { type: 'Sphere' });
      const [[, y0], [, y1]] = d3.geoPath(p).bounds({ type: 'Sphere' });
      h = Math.ceil(y1 - y0 + 8); p.translate([p.translate()[0] + 4, p.translate()[1] - y0 + 4]);
      frame = (ctx, path) => path({ type: 'Sphere' });
    }
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const path = d3.geoPath(p, ctx);
    ctx.save();
    ctx.beginPath(); frame(ctx, path); ctx.fillStyle = '#cfe6f5'; ctx.fill(); ctx.clip();
    ctx.beginPath(); path(d3.geoGraticule10()); ctx.strokeStyle = 'rgba(29,42,58,.13)'; ctx.lineWidth = 0.7; ctx.stroke();
    for (const f of land) {
      ctx.beginPath(); path(f);
      ctx.fillStyle = f.id === 'GL' ? '#8d6cab' : isAfrica(f.id) ? '#e09f3e' : '#efe7d6'; ctx.fill();
      ctx.strokeStyle = 'rgba(29,42,58,.25)'; ctx.lineWidth = 0.4; ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); frame(ctx, path); ctx.strokeStyle = '#1d2a3a'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  async function showExplore() {
    $('#title').hidden = true; $('#hud').hidden = true; $('#mapwrap').hidden = true; $('#explore').hidden = false; $('#explore').scrollTop = 0;
    $('#installBtn').hidden = true; $('#offlineBadge').hidden = true;
    const box = $('#mapTypes');
    if (!box.dataset.done) {
      box.innerHTML = MAP_TYPES.map((T, i) => `<figure class="map-type"><canvas data-i="${i}" aria-label="${esc(T.name)}"></canvas><figcaption><b>${esc(T.name)}</b>${T.text}</figcaption></figure>`).join('');
      try { await loadAll(['data/world.js', 'data/world-meta.js']); } catch (e) { return; }
      const land = topojson.feature(window.GEO_WORLD, window.GEO_WORLD.objects.countries).features;
      const drawAll = () => box.querySelectorAll('canvas').forEach((c) => drawMapType(c, MAP_TYPES[+c.dataset.i], land));
      requestAnimationFrame(drawAll);
      let rt = null; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('#explore').hidden) drawAll(); }, 200); });
      box.dataset.done = '1';
    }
  }
  $('#openExplore').onclick = () => { sfx.click(); showExplore(); };
  $('#exploreBack').onclick = () => { sfx.click(); $('#explore').hidden = true; showTitle(); };
  document.querySelectorAll('[data-explore]').forEach((b) => b.onclick = () => { sfx.click(); $('#explore').hidden = true; startMode(b.dataset.explore, null, true); });
  const exploring = () => !!(S && S.phase === 'explore');

  // Famous-place pins: a photo and a name sitting on the spot, shown once you zoom in
  const pinEls = new Map();
  function placeKey(c) { return (M.key === 'us' ? 'us:' : 'w:') + c; }
  function updatePins() {
    const layer = $('#pins');
    if (!map) return;
    layer.hidden = false;
    const z = map.effZoom(), show = exploring() && !!window.PLACE_INFO && z >= (M.key === 'us' ? 4.5 : 1.8);
    const big = z >= (M.key === 'us' ? 9 : 5);
    const placed = [];
    if (show) for (const c of regions) {
      const k = placeKey(c), P = window.PLACE_INFO[k]; if (!P) continue;
      let el = pinEls.get(k);
      const xy = show ? map._toScreen([P[0], P[1]]) : null;
      if (!xy || xy[0] < -60 || xy[1] < -60 || xy[0] > map.w + 60 || xy[1] > map.h + 60) { if (el) el.hidden = true; continue; }
      const wBox = big ? 120 : 84, hBox = big ? 110 : 78;
      const box = [xy[0] - wBox / 2, xy[1] - hBox, xy[0] + wBox / 2, xy[1]];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { if (el) el.hidden = true; continue; }
      placed.push(box);
      if (!el) {
        el = document.createElement('button'); el.className = 'pin';
        const f = window.PLACE_PICS && window.PLACE_PICS[k];
        const name = extra(c)[0] || '';
        el.innerHTML = (f ? `<img src="${f}" alt="" loading="lazy">` : '<span class="pin-noimg">📍</span>') + `<span class="pin-name">${esc(name)}</span>`;
        el.onclick = (e) => { e.stopPropagation(); showPlace(c); };
        layer.appendChild(el); pinEls.set(k, el);
      }
      el.hidden = false; el.classList.toggle('big', big);
      el.style.transform = `translate(${Math.round(xy[0])}px, ${Math.round(xy[1])}px)`;
    }
    updateParks(z, placed);
  }
  /* 🌲 U.S. national parks: small tree markers (in games and while exploring). Tap one to learn about it. */
  const parkEls = new Map();
  const US_NAMES = Object.fromEntries('AL Alabama|AK Alaska|AZ Arizona|AR Arkansas|CA California|CO Colorado|CT Connecticut|DE Delaware|FL Florida|GA Georgia|HI Hawaii|ID Idaho|IL Illinois|IN Indiana|IA Iowa|KS Kansas|KY Kentucky|LA Louisiana|ME Maine|MD Maryland|MA Massachusetts|MI Michigan|MN Minnesota|MS Mississippi|MO Missouri|MT Montana|NE Nebraska|NV Nevada|NH New Hampshire|NJ New Jersey|NM New Mexico|NY New York|NC North Carolina|ND North Dakota|OH Ohio|OK Oklahoma|OR Oregon|PA Pennsylvania|RI Rhode Island|SC South Carolina|SD South Dakota|TN Tennessee|TX Texas|UT Utah|VT Vermont|VA Virginia|WA Washington|WV West Virginia|WI Wisconsin|WY Wyoming|AS American Samoa|VI the U.S. Virgin Islands'.split('|').map((x) => [x.slice(0, 2), x.slice(3)]));
  function updateParks(z, placed) {
    const P = window.PARKS;
    const show = P && exploring() && z >= (M.key === 'us' ? 3.5 : 3); // in games they would distract from the takeovers
    const named = z >= (M.key === 'us' ? 7 : 6);
    P && P.forEach((pk, i) => {
      let el = parkEls.get(i);
      const xy = show ? map._toScreen([pk[2], pk[3]]) : null;
      if (!xy || xy[0] < -40 || xy[1] < -40 || xy[0] > map.w + 40 || xy[1] > map.h + 40) { if (el) el.hidden = true; return; }
      const wBox = named ? 110 : 26, box = [xy[0] - 13, xy[1] - 13, xy[0] - 13 + wBox, xy[1] + 13];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { if (el) el.hidden = true; return; }
      placed.push(box);
      if (!el) {
        el = document.createElement('button'); el.className = 'park'; el.setAttribute('aria-label', pk[0] + ' National Park');
        el.innerHTML = `<span class="park-ico">🌲</span><span class="park-name">${esc(pk[0])}</span>`;
        el.onclick = (e) => { e.stopPropagation(); showPark(pk); };
        $('#pins').appendChild(el); parkEls.set(i, el);
      }
      el.hidden = false; el.classList.toggle('named', named);
      el.style.transform = `translate(${Math.round(xy[0])}px, ${Math.round(xy[1])}px)`;
    });
  }
  function showPark(pk, from) {
    const f = window.PARK_PICS && window.PARK_PICS[pk[0]];
    sfx.click();
    openModal(`${f ? `<img class="place-photo" src="${f}" alt="${esc(pk[0])} National Park">` : ''}
      <h3 class="mtitle">🌲 ${esc(pk[0])} National Park</h3>
      <p class="center small" style="margin-top:-4px">📍 In ${esc((() => { const n = [pk[1], ...(pk[5] || [])].map((c) => US_NAMES[c] || c); return n.length > 2 ? n.slice(0, -1).join(', ') + ', and ' + n.at(-1) : n.join(' and '); })())}</p>
      <p class="place-about">${esc(pk[4])}</p>
      <p class="center small">National parks protect special nature so everyone can enjoy it, now and in the future. The United States has 63 of them.</p>
      <div class="btn-row">${from ? `<button class="btn ghost" id="pkBack">Back to ${esc(nameOf(from))}</button>` : ''}<button class="btn gold" data-close>${exploring() ? 'Keep exploring' : 'Back to the map'}</button></div>`);
    if (from) $('#pkBack').onclick = () => { closeModal(); onRegionClick(from, null); };
  }
  function clearPins() { pinEls.forEach((el) => el.remove()); pinEls.clear(); parkEls.forEach((el) => el.remove()); parkEls.clear(); $('#pins').hidden = true; }
  function showPlace(c) {
    const k = placeKey(c), P = window.PLACE_INFO[k], f = window.PLACE_PICS && window.PLACE_PICS[k];
    sfx.click();
    openModal(`${f ? `<img class="place-photo" src="${f}" alt="${esc(extra(c)[0])}">` : ''}
      <h3 class="mtitle">${esc(extra(c)[0])}</h3>
      <p class="center small" style="margin-top:-4px">📍 In ${esc(nameOf(c))}</p>
      <p class="place-about">${esc(P[2])}</p>
      <div class="btn-row"><button class="btn ghost" id="plCard">About ${esc(shortName(c))}</button><button class="btn gold" data-close>Keep exploring</button></div>`);
    $('#plCard').onclick = () => { closeModal(); onRegionClick(c, null); };
  }

  /* Game style. Ages are guidelines: most kids can handle a small loss somewhere around 6–8,
     and kids with ADHD are often 2–3 years behind in self-regulation (Barkley's ~30% rule of thumb). */
  const STAKES = {
    none: { label: 'No-loss mode', ages: 'Recommended for ages 4–9', desc: 'Losing a spin never costs anything. Study the card and try again.' },
    real: { label: 'Real stakes', ages: 'Ages 7–9+', desc: 'Losing a spin costs your newest place (never your home). Study the card and try again.' }
  };
  function renderStakesPicker(el) {
    el.innerHTML = `<div class="lvl-title">🎮 Game style</div>
      <div class="stakes-row">${Object.entries(STAKES).map(([k, v]) => `<button data-s="${k}" class="stake ${settings.stakes === k ? 'on' : ''}" aria-pressed="${settings.stakes === k}"><b>${settings.stakes === k ? '✓ ' : ''}${v.label}</b><span class="ages">${v.ages}</span><span class="sdesc">${v.desc}</span></button>`).join('')}</div>
      <div class="lvl-desc">Handling losing is a developmental skill that takes time and practice. Every child is different. Watch how your child handles a loss, and switch when appropriate.</div>`;
    el.querySelectorAll('button').forEach((b) => b.onclick = () => { settings.stakes = b.dataset.s; saveSettings(); sfx.click(); renderStakesPicker(el); });
  }
  function renderLevelPicker(el) {
    const on = settings.cats;
    el.innerHTML = `<div class="lvl-title">🧠 Brain Boost questions — pick any topics</div>
      <div class="cat-chips">${Object.entries(CATS).map(([k, v]) => `<button data-c="${k}" class="${on.includes(k) ? 'on' : ''}" aria-pressed="${on.includes(k)}">${on.includes(k) ? '✓ ' : ''}${v.label}</button>`).join('')}</div>
      <div class="lvl-desc">${on.length ? 'Listed from easiest to hardest. Where in the World = continents, hemispheres and compass directions. Land &amp; Nature = deserts, rainforests, mountains, climate and animals.' : 'No topics picked: no questions, and the wheel stays at 50%.'}</div>`;
    el.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const k = b.dataset.c; settings.cats = on.includes(k) ? on.filter((x) => x !== k) : [...on, k];
      saveSettings(); sfx.click(); renderLevelPicker(el);
    });
  }
  $('#setSound').addEventListener('change', (e) => { settings.sound = e.target.checked; saveSettings(); updateSoundBtn(); });

  /* ================= START A MODE ================= */
  /* Getting a map ready takes real work (loading the shapes and measuring every country).
     It starts quietly while the title screen is showing, a little at a time, so the map opens
     right away when a player picks a mode. If they pick before it is done, it finishes at full speed. */
  const prepared = {}; let prepRush = false;
  function prepareMode(key, rush) {
    if (rush) prepRush = true;
    if (prepared[key]) return prepared[key];
    const Md = MODES[key];
    prepared[key] = (async () => {
      await loadAll(Md.scripts);
      const topo = Md.geo();
      const feats = topojson.feature(topo, topo.objects[Md.obj]).features;
      if (key === 'world') { // Tuvalu is too small for the base map — add it as a dot
        const tv = window.WORLD_META.TV; feats.push({ type: 'Feature', id: 'TV', properties: { n: 'Tuvalu', o: 'TV' }, geometry: { type: 'Point', coordinates: [tv.ll[1], tv.ll[0]] } });
      }
      let t = performance.now();
      for (const f of feats) {
        GameMap.prepFeature(f);
        if (!prepRush && performance.now() - t > 12) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); } // stay out of the way of taps
      }
      return { topo, feats };
    })();
    prepared[key].catch(() => { delete prepared[key]; }); // offline and not saved yet: try again later
    return prepared[key];
  }
  function warmUp() {
    if (prepRush || !document.hidden && !$('#title').hidden) {
      const first = store.get(SAVE_KEY('us')) && !store.get(SAVE_KEY('world')) ? 'us' : 'world';
      prepareMode(first).then(() => prepareMode(first === 'us' ? 'world' : 'us')).catch(() => {});
    }
  }

  function syncHud() {
    const h = $('#hud').getBoundingClientRect().height; if (!h) return;
    document.documentElement.style.setProperty('--hud-h', Math.ceil(h) + 'px');
    if (map) { const r = $('#map').getBoundingClientRect(); if (r.width && (Math.abs(r.height - map.h) > 1 || Math.abs(r.width - map.w) > 1)) map.resize(); }
  }

  /* Learning guides on the map: hemispheres (world) and U.S. regions (USA), so kids SEE what the cards and questions talk about */
  const REGION_LABELS = [{ t: 'NORTHEAST', ll: [-74.6, 43.4], c: '#2b6cb0' }, { t: 'MIDWEST', ll: [-93.5, 43.6], c: '#9a6400' }, { t: 'SOUTH', ll: [-89.5, 33.2], c: '#b03a1e' },
    { t: 'WEST', ll: [-114.5, 40.8], c: '#2f7a3a' }, { t: 'WEST', ll: [-152, 64.5], c: '#2f7a3a' }, { t: 'WEST', ll: [-157.6, 21.9], c: '#2f7a3a' }];
  function setGuides() {
    if (!map || !M) return;
    map.guides = !settings.guides ? null : M.key === 'us' ? { type: 'regions', regionOf: (o) => US_REGION[o], labels: REGION_LABELS } : { type: 'hemi' };
    const b = $('#guideBtn');
    b.innerHTML = `${M.key === 'us' ? '🗺️ Regions' : '🌐 Hemispheres'}<b>${settings.guides ? 'ON' : 'OFF'}</b>`;
    b.classList.toggle('on', !!settings.guides); b.setAttribute('aria-pressed', !!settings.guides);
    b.title = M.key === 'us' ? 'Show the 4 regions of the United States' : 'Show the equator, the Prime Meridian, and the 4 hemispheres';
    if (S) renderLegend();
    map.draw();
  }
  $('#guideBtn').addEventListener('click', () => { settings.guides = !settings.guides; saveSettings(); sfx.click(); setGuides(); });

  async function startMode(key, saved, explore = false) {
    M = MODES[key]; clearPins();
    $('#explore').hidden = true; $('#title').hidden = true; $('#hud').hidden = false; $('#mapwrap').hidden = false; $('#installBtn').hidden = true; $('#offlineBadge').hidden = true;
    banner('🌍 Getting the map ready…');
    let topo, feats;
    try {
      await new Promise((r) => setTimeout(r, 30)); // let the message show first
      if (explore) await loadScript('data/place-info.js');
      ({ topo, feats } = await prepareMode(key, true));
    } catch (e) { banner('Sorry — the map could not load. Please refresh.'); return; }
    regions = [...new Set(feats.map((f) => f.properties.o).filter(Boolean))].filter((c) => info(c));
    regions.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

    if (!map) {
      map = new GameMap($('#map'));
      window.__map = map; // handy for debugging in the browser console
      map.onClick = onRegionClick;
      map.onHover = onHover;
      map.onZoom = (z) => { $('#zoomHint').style.opacity = z >= 2.2 ? 0 : 1; };
    }
    map.colorOf = colorOf;
    map.empireOf = (r) => (S ? S.own[r] : r);
    map.labelName = (r) => (M.key === 'us' ? nameOf(r) : (info(r) ? info(r)[0].replace(/ \(.*\)$/, '') : r));
    map.labelPlan = (r) => labelPlan[r] || null;
    map.labelShort = (r) => (M.key === 'us' ? r : null); // postal code when a state's full name won't fit
    buildNeighbors(topo);
    map.onRender = () => { updateCompass(); updatePins(); };
    map.view = settings.view;
    map.setMode(key, feats, topo, M.obj);
    if (key === 'us' && window.GEO_WORLD) { // show the rest of the world around the USA (gray, not playable)
      const w = topojson.feature(window.GEO_WORLD, window.GEO_WORLD.objects.countries);
      const NAMES = { CA: 'Canada', MX: 'Mexico', RU: 'Russia', CU: 'Cuba', GL: 'Greenland', BS: 'The Bahamas' };
      w.features = w.features.filter((f) => f.properties.o !== 'US' && f.id !== 'PR' && !['GU', 'MP', 'VI', 'AS'].includes(f.id));
      w.features.forEach((f) => { const meta = window.WORLD_META && window.WORLD_META[f.id]; f.properties.n = NAMES[f.id] || (meta && meta.name) || f.properties.n; });
      map.setBackdrop(w);
    } else map.setBackdrop(null);
    map.setView(settings.view);
    setViewButtons();
    assignAIColors(topo);

    S = explore ? { v: 1, mode: key, phase: 'explore', player: null, color: null, own: Object.fromEntries(regions.map((r) => [r, r])), visited: [], factIdx: {}, log: [] } : saved || { v: 1, mode: key, phase: 'pick', player: null, color: null, own: Object.fromEntries(regions.map((r) => [r, r])), lives: 0, battles: 0, wins: 0, visited: [], conquered: [], startedAs: null, factIdx: {}, lastBeatBy: null, log: [] };
    // make sure save matches the current map
    for (const r of regions) if (!S.own[r]) S.own[r] = r;
    save();
    setGuides(); buildSearch(); refresh(); syncHud();
    loadAll(['data/parks.js', 'data/park-pics.js']).then(() => map.draw()).catch(() => { /* parks are optional */ });
    banner(null);
    loadAll(DETAIL_SCRIPTS).then(() => {
      let rivers = window.RIVERS, features = window.GEOFEATURES;
      if (key === 'us') { // keep only rivers & mountains that are inside the 50 states
        const usa = topojson.merge(topo, topo.objects.states.geometries);
        const inUS = (pt) => d3.geoContains(usa, pt);
        features = features.filter((f) => inUS([f[1], f[2]]));
        rivers = { type: 'FeatureCollection', features: rivers.features.filter((r) => {
          const lines = r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.coordinates;
          return lines.some((l) => l.some((pt, i) => i % 6 === 0 && inUS(pt)));
        }) };
      }
      // stars = capitals; dots = the top 5 popular cities of each place (skipping any that already has a star)
      const stars = window.PLACES.filter((p) => (key === 'us' ? p[5] === 'US' && p[3] >= 1 : p[3] === 2));
      const cities = (window.CITIES[key] || []).filter((c) => !stars.some((st) => Math.abs(st[1] - c[1]) < 0.12 && Math.abs(st[2] - c[2]) < 0.12));
      map.detail = { places: stars, cities, rivers, lakes: window.LAKES, features };
      map.draw();
    }).catch(() => { /* details are optional */ });
    $('#btnPassport').hidden = explore; $('#zHere').hidden = explore;
    if (explore) banner(`🔭 Zoom in to see famous places. Tap a picture or any ${M.unit} to learn about it!`, 6000);
    else if (S.phase === 'pick') introPick();
    else if (S.phase === 'respawn') respawnPrompt();
    else if (S.phase === 'won') showWin();
    else if (S.phase === 'lost') showGameOver();
  }

  function assignAIColors(topo) {
    // greedy coloring so neighboring countries/states get different colors
    const geoms = topo.objects[M.obj].geometries;
    const nb = topojson.neighbors(geoms);
    const order = geoms.map((g, i) => i).sort((a, b) => nb[b].length - nb[a].length);
    colorAI = {};
    for (const i of order) {
      const o = geoms[i].properties.o; if (!o || colorAI[o]) continue;
      const used = new Set(nb[i].map((j) => colorAI[geoms[j].properties.o]).filter(Boolean));
      colorAI[o] = AI_COLORS.find((c) => !used.has(c)) || AI_COLORS[i % AI_COLORS.length];
    }
    for (const r of regions) if (!colorAI[r]) colorAI[r] = AI_COLORS[r.charCodeAt(0) % AI_COLORS.length];
  }

  function save() { if (S && M && S.phase !== 'explore') store.set(SAVE_KEY(M.key), S); }

  /* ================= HUD / LEGEND ================= */
  /* ---------- map labels after conquests ----------
     A conquered place that touches its conqueror's land (directly or through other conquered places)
     merges in: its border is erased and its own name is hidden, so the empire shows ONE name.
     A conquered place that doesn't touch (across water or far away) keeps its border and is
     relabeled with the conqueror's name. */
  let regionNb = new Map(), labelPlan = {};
  function buildNeighbors(topo) {
    const geoms = topo.objects[M.obj].geometries, nb = topojson.neighbors(geoms);
    regionNb = new Map(regions.map((r) => [r, new Set()]));
    geoms.forEach((g, i) => { const a = g.properties.o; if (!a || !regionNb.has(a)) return;
      for (const j of nb[i]) { const b = geoms[j].properties.o; if (b && b !== a && regionNb.has(b)) regionNb.get(a).add(b); } });
  }
  const shortName = (c) => nameOf(c).replace(/ \(.*\)$/, '');
  const mainArea = (c) => { const fs = map.byRegion.get(c) || []; const f = fs.find((x) => x.id === c) || fs[0]; return f ? f.area : 0; };
  // middle of a group of places joined into one shape (uses the biggest piece, so islands don't pull it into the sea)
  function groupCenter(group) {
    try {
      const obj = map.topo.objects[map.objName];
      const merged = topojson.merge(map.topo, obj.geometries.filter((g) => group.includes(g.properties.o)));
      let best = null, ba = -1;
      for (const poly of merged.coordinates) { const f = { type: 'Polygon', coordinates: poly }; const a = d3.geoArea(f); if (a > ba) { ba = a; best = f; } }
      return best ? d3.geoCentroid(best) : null;
    } catch (e) { return null; }
  }
  function computeLabelPlan() {
    labelPlan = {};
    const byEmpire = new Map();
    for (const r of regions) { const e = S.own[r]; if (!byEmpire.has(e)) byEmpire.set(e, []); byEmpire.get(e).push(r); }
    for (const [e, members] of byEmpire) {
      if (members.length === 1 && members[0] === e) continue; // a free place: normal label
      const left = new Set(members);
      while (left.size) { // split the empire into connected groups of touching places
        const start = left.has(e) ? e : left.values().next().value;
        const group = [start]; left.delete(start);
        for (let i = 0; i < group.length; i++) for (const n of regionNb.get(group[i]) || []) if (left.has(n)) { left.delete(n); group.push(n); }
        if (group.length === 1 && group[0] === e) continue; // the home place on its own: normal label
        const anchor = group.includes(e) ? e : group.reduce((a, b) => (mainArea(b) > mainArea(a) ? b : a));
        const area = group.reduce((sum, c) => sum + mainArea(c), 0);
        const at = groupCenter(group); // the name sits in the middle of the whole combined territory
        for (const c of group) labelPlan[c] = c === anchor ? { text: shortName(e), area, at } : { hide: true };
      }
    }
  }

  function refresh() { queueMicrotask(syncHud);
    computeLabelPlan();
    map.highlight = new Set(S.player ? regionsOf(S.player) : []);
    map.invalidateBorders(); map.draw();
    const hs = $('#hudStatus');
    if (S.player && (S.phase === 'play' || S.phase === 'won')) {
      const n = regionsOf(S.player).length, pct = Math.round(n / regions.length * 100);
      hs.innerHTML = `<img class="flag" src="${M.flag(S.player)}" alt=""><span class="meta">${esc(nameOf(S.player))} — ${n} / ${regions.length} ${M.units} • 💪 ${S.comebacks || 0} ${S.comebacks === 1 ? 'comeback' : 'comebacks'}</span><span class="bar"><i style="width:${pct}%"></i></span>`;
    } else if (S.phase === 'explore') hs.innerHTML = `<span class="meta">🔭 Exploring ${M.key === 'us' ? 'the USA' : 'the world'}</span>`;
    else if (S.phase === 'pick') hs.innerHTML = `<span class="meta">${M.title}: choose your ${M.unit}</span>`;
    else if (S.phase === 'respawn') hs.innerHTML = `<span class="meta">Choose a new ${M.unit} to play as</span>`;
    else hs.innerHTML = '';
    renderLegend();
  }

  function renderLegend() {
    const lg = $('#legend'); const em = empires();
    const top = [...em.entries()].filter(([e, n]) => n > 1 && e !== S.player).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let html = `<h4>Map key <button id="lgToggle" aria-label="Show or hide key">${settings.legendOpen ? '▾' : '▸'}</button></h4><div class="body">`;
    if (S.player) html += `<div class="row"><span class="sw" style="background:${S.color};box-shadow:0 0 0 2px #fff inset"></span>You (${esc(nameOf(S.player))})</div>`;
    for (const [e, n] of top) html += `<div class="row"><span class="sw" style="background:${empireColor(e)}"></span>${esc(nameOf(e))}’s empire (${n})</div>`;
    html += `<div class="row"><span class="sw" style="background:repeating-linear-gradient(45deg,#f6d7a7 0 4px,#cfe3b5 4px 8px,#c9d8ef 8px 12px)"></span>${exploring() ? M.units[0].toUpperCase() + M.units.slice(1) : 'Free ' + M.units}</div>`;
    if (exploring()) html += `<div class="row"><span class="sym">📷</span>Famous place (zoom in)</div>`;
    if (exploring()) html += `<div class="row"><span class="sym">🌲</span>National park (zoom in)</div>`;
    if (settings.guides && M.key === 'world') html += `<div class="row"><span class="sym line" style="border-color:#e2483d"></span>Equator</div><div class="row"><span class="sym line" style="border-color:#2b6cb0"></span>Prime Meridian</div>`;
    if (settings.guides && M.key === 'us') html += exploring() ? Object.entries(REGION_FILL).map(([n, c]) => `<div class="row"><span class="sw" style="background:${c[0]}"></span>${n}</div>`).join('') : `<div class="row"><span class="sym line" style="border-color:#1d2a3a"></span>Region border</div>`;
    html += `<div class="row"><span class="sym" style="color:#d62828">★</span>Capital city</div><div class="row"><span class="sym">●</span>Major city</div>
      <div class="row"><span class="sym" style="color:#4f97cf">〰</span>River</div><div class="row"><span class="sym" style="color:#7a5230">▲</span>Mountains</div></div>`;
    lg.innerHTML = html; lg.classList.toggle('collapsed', !settings.legendOpen);
    $('#lgToggle').onclick = () => { settings.legendOpen = !settings.legendOpen; saveSettings(); renderLegend(); };
  }

  let bannerTimer = null;
  function banner(text, ms) {
    const b = $('#banner'); clearTimeout(bannerTimer);
    if (!text) { b.hidden = true; return; }
    b.textContent = text; b.hidden = false;
    if (ms) bannerTimer = setTimeout(() => (b.hidden = true), ms);
  }

  function onHover(f, xy) {
    const tt = $('#tooltip');
    if (!f || !xy || !S) { tt.hidden = true; return; }
    const r = f.o, e = S.own[r];
    let sub = '';
    if (f.id !== r && f.nm) sub = `${f.nm} — part of ${nameOf(r)}`;
    if (S.player && e === S.player) sub = (sub ? sub + ' • ' : '') + 'Your land';
    else if (e !== r) sub = (sub ? sub + ' • ' : '') + `Ruled by ${nameOf(e)}`;
    tt.innerHTML = `${esc(nameOf(r))}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    tt.hidden = false;
    const x = Math.min(xy[0] + 14, map.w - tt.offsetWidth - 6), y = Math.max(6, xy[1] - 40);
    tt.style.left = x + 'px'; tt.style.top = y + 'px';
  }

  /* ================= SEARCH ================= */
  function buildSearch() {
    const dl = $('#placeList'); dl.innerHTML = regions.map((r) => `<option value="${esc(nameOf(r))}">`).join('');
    const inp = $('#search'); inp.value = ''; inp.placeholder = `🔎 Find a ${M.unit}…`;
  }
  $('#search').addEventListener('change', (e) => {
    const v = e.target.value.trim().toLowerCase(); if (!v) return;
    const r = regions.find((c) => nameOf(c).toLowerCase() === v) || regions.find((c) => nameOf(c).toLowerCase().startsWith(v)) || regions.find((c) => nameOf(c).toLowerCase().includes(v));
    if (r) { map.flyTo(r); setTimeout(() => onRegionClick(r), 650); e.target.value = ''; e.target.blur(); }
  });

  /* ================= VIEW CONTROLS ================= */
  function setViewButtons() { $('#btn2d').classList.toggle('on', settings.view === '2d'); $('#btn3d').classList.toggle('on', settings.view === '3d'); }
  $('#btn2d').onclick = () => { settings.view = '2d'; saveSettings(); map.setView('2d'); setViewButtons(); sfx.click(); };
  $('#btn3d').onclick = () => { settings.view = '3d'; saveSettings(); map.setView('3d'); setViewButtons(); sfx.click(); };
  $('#zIn').onclick = () => map.zoomBy(1.8);
  $('#zOut').onclick = () => map.zoomBy(1 / 1.8);
  $('#zReset').onclick = () => map.resetView(true);
  // 🏠 Blue arrow: flies back to your home country/state (the one you picked at the start)
  $('#zHere').onclick = () => {
    sfx.click();
    if (!S || !S.player) { banner(`Choose your ${M ? M.unit : 'country'} first — then this arrow takes you home!`, 3500); return; }
    const home = S.startedAs && S.own[S.startedAs] === S.player ? S.startedAs : S.player;
    map.flyTo(home);
    banner(`🏠 Home: ${nameOf(home)}`, 3000);
  };
  function updateSoundBtn() { $('#btnSound').textContent = settings.sound ? '🔊' : '🔇'; }
  $('#btnSound').onclick = () => { settings.sound = !settings.sound; saveSettings(); updateSoundBtn(); sfx.click(); };
  updateSoundBtn();
  $('#btnPassport').onclick = () => { sfx.click(); showPassport(); };
  $('#btnMenu').onclick = () => { sfx.click(); showMenu(); };

  function showMenu() {
    if (exploring()) {
      openModal(`<h3 class="mtitle">Menu</h3><div class="btn-row" style="flex-direction:column"><button class="btn gold" data-close>🔭 Keep exploring</button><button class="btn ghost" id="mnTypes">🗺️ Types of Maps</button><button class="btn ghost" id="mnHome">🏠 Main menu</button></div>`);
      $('#mnTypes').onclick = () => { closeModal(); clearPins(); showExplore(); };
      $('#mnHome').onclick = () => { closeModal(); clearPins(); showTitle(); };
      return;
    }
    openModal(`<h3 class="mtitle">Menu</h3>
      <div class="btn-row" style="flex-direction:column">
        <button class="btn gold" data-close>▶ Keep playing</button>
        <button class="btn ghost" id="mnHow">❓ How to play</button>
        ${canInstall() ? '<button class="btn ghost" id="mnInstall">📲 Get the app</button>' : ''}
        <button class="btn ghost" id="mnHome">🏠 Main menu (your game is saved)</button>
        <button class="btn primary" id="mnRestart">🔄 Restart this game</button>
      </div>
      <p class="small center" style="margin-top:12px">${offlineReady ? '✈️ This game is saved on your device — it works in airplane mode.' : ''}</p>
      <div id="mnLevel" class="level-pick" style="margin-top:16px"></div><div id="mnStakes" class="level-pick"></div>${supportHTML()}`);
    renderLevelPicker($('#mnLevel')); renderStakesPicker($('#mnStakes'));
    $('#mnHome').onclick = () => { closeModal(); save(); showTitle(); };
    $('#mnHow').onclick = () => { closeModal(); showHow(); };
    if ($('#mnInstall')) $('#mnInstall').onclick = () => { closeModal(); doInstall(); };
    $('#mnRestart').onclick = () => {
      openModal(`<h3 class="mtitle">Restart?</h3><p class="center">This erases your ${M.title} progress and starts fresh.</p>
        <div class="btn-row"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="rsYes">Yes, restart</button></div>`);
      $('#rsYes').onclick = () => { closeModal(); store.del(SAVE_KEY(M.key)); startMode(M.key, null); };
    };
  }
  function showHow() {
    openModal(`<h3 class="mtitle">How to play</h3>${$('.howto ol').outerHTML}<div class="btn-row"><button class="btn gold" data-close>Got it!</button></div>`);
  }

  /* ================= PICK YOUR COUNTRY ================= */
  function introPick() {
    banner(`👆 Tap the ${M.unit} you want to be!`);
    openModal(`<div style="text-align:center;font-size:54px">${M.key === 'us' ? '🇺🇸' : '🌍'}</div>
      <h3 class="mtitle">Choose your ${M.unit}!</h3>
      <p class="center">Tap any ${M.unit} on the map to learn about it. When you find the one you want, press <b>Play as…</b></p>
      <p class="center small">Tip: drag to move, pinch or scroll to zoom, or use the 🔎 search box.</p>
      <div class="btn-row"><button class="btn gold" data-close>Let’s go!</button></div>`);
  }

  function chooseColor(r) {
    let sel = PLAYER_COLORS[0][1];
    openModal(`<img class="flag-big" src="${M.flag(r)}" alt="Flag of ${esc(nameOf(r))}" style="height:80px">
      <h3 class="mtitle">You are ${esc(nameOf(r))}!</h3><p class="center">Pick your empire color:</p>
      <div class="colors">${PLAYER_COLORS.map(([n, c], i) => `<button data-c="${c}" title="${n}" aria-label="${n}" class="${i === 0 ? 'sel' : ''}" style="background:${c}"></button>`).join('')}</div>
      <div class="btn-row"><button class="btn go" id="ccGo">Start conquering! ⚔️</button></div>`);
    card.querySelectorAll('.colors button').forEach((b) => b.onclick = () => { card.querySelectorAll('.colors button').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); sel = b.dataset.c; sfx.click(); });
    $('#ccGo').onclick = () => {
      S.player = r; S.color = sel; S.startedAs = r; S.phase = 'play'; addVisited(r); save();
      closeModal(); refresh(); sfx.win();
      banner(`You are ${nameOf(r)}! Tap any ${M.unit} to challenge it.`, 5000);
    };
  }

  /* ================= INFO CARD ================= */
  function addVisited(r) { if (!S.visited.includes(r)) S.visited.push(r); }
  function nextFact(r) {
    const facts = info(r)[M.key === 'us' ? 7 : 6];
    let st = S.factIdx[r];
    if (!st || !st.order || st.order.length !== facts.length || st.pos >= facts.length) {
      let order = shuffle(facts.map((_, i) => i));
      if (st && st.order && order[0] === st.order[st.order.length - 1] && order.length > 1) order.push(order.shift());
      st = { order, pos: 0 };
    }
    const f = facts[st.order[st.pos]]; st.pos++; S.factIdx[r] = st; save();
    return f;
  }

  function sizeLine(r) {
    const ref = S.player && S.player !== r ? S.player : null;
    const a = map.regionArea(r) || (M.key === 'world' && window.WORLD_META[r] ? window.WORLD_META[r].area : 0);
    const fmtA = (x) => x >= 1e6 ? (x / 1e6).toFixed(1) + ' million' : Math.round(x).toLocaleString();
    let line = `${fmtA(a)} km² (${fmtA(a * 0.3861)} sq mi)`;
    if (ref) {
      const b = map.regionArea(ref) || (window.WORLD_META && window.WORLD_META[ref] ? window.WORLD_META[ref].area : 0);
      if (a && b) {
        const ratio = a / b;
        if (ratio >= 1.15) line += `<br>${esc(nameOf(r))} is about <strong>${ratio >= 10 ? Math.round(ratio).toLocaleString() : ratio.toFixed(1)}×</strong> bigger than ${esc(nameOf(ref))}!`;
        else if (ratio <= 0.87) line += `<br>${esc(nameOf(ref))} is about <strong>${(1 / ratio) >= 10 ? Math.round(1 / ratio).toLocaleString() : (1 / ratio).toFixed(1)}×</strong> bigger than ${esc(nameOf(r))}!`;
        else line += `<br>About the same size as ${esc(nameOf(ref))}!`;
      }
    }
    return line;
  }

  // "Northern & Western Hemispheres · west of Ohio"
  function whereLine(r, world) {
    const parts = [];
    if (world) {
      const h = hemispheres(r);
      if (h) {
        if (h.ns !== 'both' && h.ew !== 'both') parts.push(`${h.ns} & ${h.ew} Hemispheres`);
        else if (h.ns === 'both' && h.ew === 'both') parts.push('crosses the equator and the Prime Meridian');
        else if (h.ns === 'both') parts.push(`${h.ew} Hemisphere · crosses the equator`);
        else parts.push(`${h.ns} Hemisphere · crosses the Prime Meridian`);
      }
    }
    if (S && S.player && S.player !== r) { const d = directionFrom(S.player, r, false); if (d) parts.push(`${d} of ${esc(nameOf(S.player))}${acrossPacific(S.player, r) ? ' (across the Pacific Ocean)' : ''}`); }
    if (!parts.length) return '';
    return world ? parts.join(' · ') : ` · ${parts.join(' · ')}`;
  }
  function cardHTML(r, fact, featName) {
    const I = info(r); const us = M.key === 'us';
    const e = S.own[r];
    let status = '';
    if (featName && featName !== I[0] && featName !== nameOf(r)) status += `<div class="sub" style="margin:2px 0 0">📍 ${esc(featName)} is part of ${esc(I[0])}</div>`;
    if (S.player && e === S.player) status += `<div class="mine">🏰 This is part of your empire!</div>`;
    else if (e !== r) status += `<div class="ruled">⚔️ Now ruled by ${esc(nameOf(e))} (${regionsOf(e).length} ${M.units})</div>`;
    let rows = '';
    if (us) {
            rows += `<li><span class="ico">🏷️</span><div><b>Nickname</b>${esc(I[2])}</div></li>`;
      rows += `<li><span class="ico">📜</span><div><b>Became a state</b>${I[3]} — the ${ordinal(I[4])} state</div></li>`;
      const bird = I[5].split(' (')[0];
      rows += `<li class="with-pic"><span class="ico">🐦</span><div><b>State bird</b>${esc(I[5])}</div>${pic(bird)}</li>`;
      const flower = (window.US_FLOWERS || {})[r];
      if (flower) rows += `<li class="with-pic"><span class="ico">🌸</span><div><b>State flower</b>${esc(flower)}</div>${pic(flower)}</li>`;
      rows += `<li><span class="ico">👨‍👩‍👧</span><div><b>Population</b>${fmtPop(I[6])} people</div></li>`;
    } else {
      rows += `<li><span class="ico">👋</span><div><b>Say hello!</b>${esc(I[4])} <button class="chip" id="sayHi" style="padding:2px 10px;margin-left:4px">🔊</button></div></li>`;
      rows += `<li><span class="ico">👨‍👩‍👧</span><div><b>Population</b>${fmtPop(I[5])} people</div></li>`;
    }
    const ex = extra(r);
    if (ex[0]) rows += `<li class="with-pic"><span class="ico">🏛️</span><div><b>Famous place</b>${esc(ex[0])}</div>${placePic(r)}</li>`;
    if (ex[1]) rows += `<li><span class="ico">🎉</span><div><b>Famous for</b>${esc(ex[1])}</div></li>`;
    if (us && window.PARKS) { // 🌲 national parks in this state, with a photo of the first one
      const parks = window.PARKS.slice().filter((pk) => pk[1] === r || (pk[5] || []).includes(r));
      if (parks.length) {
        const STAR = ['Yosemite', 'Denali', 'Arches', 'Rocky Mountain', 'Everglades', 'Mount Rainier', 'Grand Canyon', 'Big Bend', 'Badlands', 'Carlsbad Caverns', 'Hawaii Volcanoes', 'Yellowstone', 'Glacier'];
        parks.sort((a, b) => (STAR.includes(b[0]) ? 1 : 0) - (STAR.includes(a[0]) ? 1 : 0)); // the best-known park first, with its photo
        const f = window.PARK_PICS && window.PARK_PICS[parks[0][0]];
        rows += `<li class="with-pic"><span class="ico">🌲</span><div><b>${parks.length > 1 ? `National parks (${parks.length})` : 'National park'}</b>${parks.map((pk) => `<button class="park-link" data-park="${esc(pk[0])}" data-from="${r}">${esc(pk[0])}</button>`).join(parks.length > 2 ? ', ' : ' and ')}</div>${f ? `<img class="pic" src="${f}" alt="${esc(parks[0][0])} National Park" loading="lazy">` : ''}</li>`;
      }
    }
    const nat = nature(r);
    if (nat.animal) rows += `<li class="with-pic"><span class="ico">🐾</span><div><b>Animal that lives here</b>${esc(nat.animal)}</div>${pic(nat.animal)}</li>`;
    if (nat.lands.length) rows += `<li><span class="ico">🌿</span><div style="width:100%"><b>Types of land</b><div class="land-grid">${nat.lands.map((k) => `<figure>${pic(LANDS[k][1], 'land-pic')}<figcaption>${esc(LANDS[k][0])}</figcaption></figure>`).join('')}</div></div></li>`;
    rows += `<li><span class="ico">📏</span><div><b>Size</b>${sizeLine(r)}</div></li>`;
    return `<img class="flag-big" src="${M.flag(r)}" alt="Flag of ${esc(I[0])}">
      <div class="cname">${esc(I[0])}</div>${sayRowHTML(r)}
      ${us ? `<div class="sub">📮 Abbreviation: <b>${r}</b><br>⭐ Capital: ${esc(I[1])}<span class="langs">🧭 Region: <b>${esc(continentOf(r))}</b>${whereLine(r)}</span></div>` : `<div class="sub">⭐ Capital: ${esc(I[1])}<span class="langs">🌎 Continent: <b>${esc(TWO_CONTINENTS[r] ? TWO_CONTINENTS[r].join(' & ') : continentOf(r))}</b></span>${whereLine(r, true) ? `<span class="langs">🧭 ${whereLine(r, true)}</span>` : ''}<span class="langs">🗣️ Language: <b>${esc(I[2])}</b>${I[3] ? `<br><span class="also">Also spoken: ${esc(I[3])}</span>` : ''}</span></div>`}
      ${status}
      <div class="didyou" id="factBox"><b>💡 Did you know?</b><span id="factText">${esc(fact)}</span></div>
      <div class="card-tools"><button class="chip" id="moreFact">🔀 Another fact</button><button class="chip" id="zoomTo">🔎 Zoom to it</button></div>
      <ul class="facts">${rows}</ul>
`;
  }

  // 🔊 How to say the place's name: the English way (so kids are understood here) and the local way (how people say their own home)
  const localName = (r) => (M.key === 'world' && window.LOCAL_NAMES ? window.LOCAL_NAMES[r] : null);
  const localVoice = (L) => (L ? pickVoice([L[2], L[2].split('-')[0]], true) : null);
  function sayRowHTML(r) {
    const L = localName(r), nonLatin = L && /[^\u0000-\u024F\u1E00-\u1EFF’ʻʿʾ]/.test(L[1]);
    const line = L ? `<div class="local-name">In ${esc(L[3])}: <b>${esc(L[0])}</b>${nonLatin ? ` <span class="script">${esc(L[1])}</span>` : ''}</div>` : '';
    const btns = `<button class="chip say" data-say="en">🔊 ${M.key === 'us' ? 'Say it' : 'In English'}</button>${L && localVoice(L) ? '<button class="chip say" data-say="local">🔊 Like a local</button>' : ''}`;
    return `${line}<div class="say-row">${btns}</div>`;
  }
  function wireSay(r, root) {
    root.querySelectorAll('[data-say]').forEach((b) => b.onclick = () => {
      if (b.dataset.say === 'en') speakLines([{ text: nameOf(r).replace(/ \(.*\)$/, ''), mood: 'word' }], pickVoice(['en-US']));
      else { const L = localName(r); speakLines([{ text: L[1], mood: 'word' }], localVoice(L)); }
    });
  }
  function wireCardTools(r) {
    $('#moreFact').onclick = () => { $('#factText').textContent = nextFact(r); sfx.click(); };
    $('#zoomTo').onclick = () => { closeModal(); map.flyTo(r); };
    const hi = $('#sayHi'); if (hi) hi.onclick = () => sayHello(r);
    wireSay(r, card);
  }

  function onRegionClick(r, feat, opts = {}) {
    if (!S || !modal.hidden) return;
    if (peekingMap) { banner(`That’s ${nameOf(r)}! Tap “Back to the question” when you’re ready.`, 3000); return; }
    stopAllSounds(); // the info card is quiet: no leftover battle sounds
    sfx.click(); addVisited(r); save();
    const fact = nextFact(r); const featName = feat && feat.id !== r ? feat.nm : null;
    const body = cardHTML(r, fact, featName);
    const e = S.own[r];
    let btns = '';
    if (opts.study) btns = `<div class="study-note">📖 Study time! Read this card. The answers to your questions are here.</div><button class="btn ghost" data-close>Choose another place</button><button class="btn go" id="act">I’m ready! Try again ⚔️</button>`;
    else if (S.phase === 'pick') btns = `<button class="btn ghost" data-close>Keep looking</button><button class="btn go" id="act">Play as ${esc(nameOf(r))}!</button>`;
    else if (S.phase === 'play') {
      if (e === S.player) btns = `<button class="btn gold" data-close>Close</button>`;
      else btns = `<button class="btn ghost" data-close>Not now</button><button class="btn primary" id="act">⚔️ Challenge ${esc(empireLabel(e))}!</button>`;
    } else if (S.phase === 'respawn') {
      if (e === S.lastBeatBy) btns = `<div class="small center" style="width:100%">${esc(nameOf(e))} just beat you — pick someone else!</div><button class="btn ghost" data-close>OK</button>`;
      else btns = `<button class="btn ghost" data-close>Keep looking</button><button class="btn go" id="act">Respawn as ${esc(empireLabel(e))}</button>`;
    } else btns = `<button class="btn gold" data-close>Close</button>`;
    openModal(body + `<div class="btn-row">${btns}</div>`);
    wireCardTools(r);
    const act = $('#act');
    if (act) act.onclick = () => {
      if (opts.study) startBattle(opts.study.enemy, r, opts.study.attempt);
      else if (S.phase === 'pick') chooseColor(r);
      else if (S.phase === 'play') startBattle(e, r);
      else if (S.phase === 'respawn') doRespawn(e);
    };
  }

  /* ================= BATTLE ================= */
  /* ---------- Brain Boost questions ----------
     Both questions are always about the place you are battling, and every answer is shown
     on that place's card — so reading the card is how you get the answers right. */
  // Question topics — pick any mix. Each topic has two kinds of question about the place you're battling.
  // Topics, roughly easiest to hardest. Pick any mix.
  const CATS = {
    capitals: { label: '⭐ Capitals', kinds: ['capital', 'capitalReverse'] },
    orientation: { label: '🧭 Where in the World', kinds: ['continent', 'hemisphere', 'direction'] },
    landmarks: { label: '🏛️ Famous Landmarks', kinds: ['place', 'placeReverse'] },
    geography: { label: '🌿 Land & Nature', kinds: ['land', 'animal'] },
    flags: { label: '🚩 Flags', kinds: ['flag', 'flagReverse'] }
  };
  // ---- where a place is: hemispheres and compass directions ----
  const mainFeature = (c) => { const fs = map.byRegion.get(c) || []; return fs.find((x) => x.id === c) || fs[0]; };
  function hemispheres(r) {
    const f = mainFeature(r); if (!f) return null;
    // use the main body of land (so e.g. the Netherlands' Caribbean islands don't count)
    const [[w, sLat], [e, nLat]] = (f._mb = f._mb || d3.geoBounds(f.mainPoly || f)), [lon, lat] = f.lp;
    const ns = sLat < 0 && nLat > 0 ? 'both' : lat >= 0 ? 'Northern' : 'Southern';
    // only the Prime Meridian (0°) splits East and West here; places crossing the 180° line count by where most of the land is
    const crossesPM = w < e && w < 0 && e > 0;
    const ew = crossesPM ? 'both' : lon < 0 ? 'Western' : 'Eastern';
    return { ns, ew };
  }
  const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  // The shortest trip from a to b crosses the Pacific Ocean (off the edge of the flat map),
  // so it goes the opposite east/west way from what a child sees on the flat map (USA to Korea: west, not east).
  function acrossPacific(a, b) {
    const fa = mainFeature(a), fb = mainFeature(b); if (!fa || !fb) return false;
    return Math.abs(fb.lp[0] - fa.lp[0]) > 180;
  }
  // direction of the shortest trip from place a to place b; null if it's too close to call
  function directionFrom(a, b, strict) {
    const fa = mainFeature(a), fb = mainFeature(b); if (!fa || !fb) return null;
    const raw = Math.abs(fb.lp[0] - fa.lp[0]);
    if (strict && raw > 140 && raw < 220) return null; // halfway around the world: going east or west is about the same
    const dx = ((fb.lp[0] - fa.lp[0] + 540) % 360) - 180, dy = fb.lp[1] - fa.lp[1];
    const ang = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const i = Math.round(ang / 45) % 8, off = Math.abs(((ang - i * 45 + 540) % 360) - 180);
    if (strict && off > 15) return null; // too close to the line between two directions
    return DIRS[i];
  }
  // Countries that sit on two continents: the first is the answer, the second is never offered as a wrong answer.
  const TWO_CONTINENTS = { RU: ['Europe', 'Asia'], TR: ['Asia', 'Europe'], KZ: ['Asia', 'Europe'], GE: ['Asia', 'Europe'], AZ: ['Asia', 'Europe'], AM: ['Asia', 'Europe'], CY: ['Europe', 'Asia'], EG: ['Africa', 'Asia'] };
  const US_REGION = {}; // U.S. Census Bureau regions
  Object.entries({ Northeast: 'CT ME MA NH RI VT NJ NY PA', Midwest: 'IL IN MI OH WI IA KS MN MO NE ND SD',
    South: 'DE FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX', West: 'AZ CO ID MT NV NM UT WY AK CA HI OR WA' })
    .forEach(([reg, list]) => list.split(' ').forEach((st) => (US_REGION[st] = reg)));
  // Flags that look alike are never shown together in a flag question.
  const LOOKALIKE = [['TD', 'RO', 'AD', 'MD'], ['ID', 'MC', 'PL', 'SG'], ['NL', 'LU', 'PY', 'HR', 'RU', 'SI', 'SK', 'RS'], ['AU', 'NZ'],
    ['IE', 'CI', 'IT', 'MX', 'IN', 'NE'], ['SN', 'ML', 'GN', 'CM', 'BJ', 'GH', 'BO'], ['CO', 'EC', 'VE'], ['NO', 'IS', 'DK', 'SE', 'FI', 'GB'],
    ['SV', 'NI', 'HN', 'GT', 'AR', 'UY'], ['JO', 'PS', 'SD', 'KW', 'AE', 'EG', 'IQ', 'SY', 'YE'], ['BE', 'DE', 'AM', 'LT'], ['AT', 'LV', 'LB', 'PE', 'CA']];
  const looksLike = (a, b) => LOOKALIKE.some((g) => g.includes(a) && g.includes(b));
  function continentOf(c) {
    if (M.key === 'us') return US_REGION[c];
    const m = window.WORLD_META[c] || {};
    if (m.region === 'Americas') return m.sub === 'South America' ? 'South America' : 'North America';
    return m.region;
  }
  const extra = (c) => (window.EXTRAS[M.key] || {})[c] || [];
  const mainLang = (c) => info(c)[2].split(/ and |, /)[0].replace(/ \(.*\)/, '');
  // wrong answers come from far-away places, so a wrong answer can never secretly be right
  const farAway = (r) => shuffle(regions.filter((c) => c !== r && continentOf(c) !== continentOf(r)));
  function choices(r, value, isOK = () => true) {
    const ans = value(r); const opts = [ans];
    for (const c of farAway(r)) { const v = value(c); if (v && !opts.includes(v) && isOK(c, v)) opts.push(v); if (opts.length === 4) break; }
    return { opts: shuffle(opts), ans };
  }
  // Nature: animals and type of land / climate (data/nature.js)
  const LANDS = { D: ['desert', 'Hot, dry desert'], R: ['rainforest', 'Steamy rainforest'], S: ['savanna', 'Savanna grasslands'], M: ['mountains', 'Tall mountains'],
    I: ['tropical islands & beaches', 'Tropical islands & beaches'], F: ['forests', 'Cool forests'], T: ['ice & tundra', 'Icy tundra & glaciers'],
    P: ['grassy plains', 'Flat grassy plains'], W: ['wetlands', 'Wetlands & swamps'] };
  const nature = (c) => { const [animal = '', lands = ''] = ((window.NATURE[M.key] || {})[c] || '').split('|'); return { animal, lands: lands.split('').filter((k) => LANDS[k]) }; };
  function livesIn(range, r) {
    const parts = range.split(' ');
    if (parts.includes(r)) return true;
    if (M.key === 'us') return parts.includes('US') || parts.includes('Americas');
    return parts.includes((window.WORLD_META[r] || {}).region);
  }
  const Qs = {
    animal(r) {
      const ans = nature(r).animal; const opts = [ans];
      for (const [a, range] of shuffle(window.NATURE.POOL)) { if (a !== ans && !ans.includes(a) && !livesIn(range, r)) opts.push(a); if (opts.length === 4) break; }
      return { pics: true, q: `Which animal lives in ${nameOf(r)}?`, opts: shuffle(opts), ans, explain: `The ${ans} lives in ${nameOf(r)}!` };
    },
    land(r) {
      const n = nature(r);
      const wrong = shuffle(Object.keys(LANDS).filter((k) => !n.lands.includes(k))).slice(0, 3);
      if (!n.lands.length || wrong.length < 2) return Qs.animal(r);
      const ans = LANDS[n.lands[0]][1];
      const also = n.lands.slice(1).map((k) => LANDS[k][0]);
      return { pics: true, q: `What kind of land is ${nameOf(r)} known for?`, opts: shuffle([ans, ...wrong.map((k) => LANDS[k][1])]), ans,
        explain: `${nameOf(r)} is known for its ${LANDS[n.lands[0]][0]}${also.length ? `, and it also has ${also.join(', ')}` : ''}.` };
    },
    continent(r) {
      const ans = continentOf(r);
      let all = M.key === 'us' ? ['Northeast', 'Midwest', 'South', 'West'] : ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
      const two = M.key === 'world' && TWO_CONTINENTS[r];
      if (two) all = all.filter((x) => x !== two[1]);
      const opts = shuffle([ans, ...shuffle(all.filter((x) => x !== ans)).slice(0, 3)]);
      return { q: M.key === 'us' ? `Which part of the U.S. is ${nameOf(r)} in?` : `Which continent is ${nameOf(r)} in?`, opts, ans,
        explain: two ? `${nameOf(r)} is in ${two[0]} — and part of it is in ${two[1]} too!` : `${nameOf(r)} is in ${M.key === 'us' ? 'the ' : ''}${ans}.` };
    },
    hemisphere(r) {
      const h = hemispheres(r);
      if (M.key === 'us' || !h || (h.ns === 'both' && h.ew === 'both')) return Qs.continent(r);
      if (h.ns !== 'both' && (h.ew === 'both' || Math.random() < 0.6)) {
        const ans = `${h.ns} Hemisphere`;
        return { q: `Is ${nameOf(r)} north or south of the equator?`, opts: ['Northern Hemisphere', 'Southern Hemisphere'], ans,
          explain: `${nameOf(r)} is in the ${ans}: ${h.ns === 'Northern' ? 'north' : 'south'} of the equator.` };
      }
      const ans = `${h.ew} Hemisphere`;
      return { q: `Is ${nameOf(r)} in the Eastern or Western Hemisphere?`, opts: ['Eastern Hemisphere', 'Western Hemisphere'], ans,
        explain: `${nameOf(r)} is in the ${ans}: ${h.ew === 'Eastern' ? 'east' : 'west'} of the Prime Meridian.` };
    },
    direction(r) {
      const from = S.player; const d = from && from !== r ? directionFrom(from, r, true) : null;
      if (!d) return M.key === 'us' ? Qs.continent(r) : Qs.hemisphere(r);
      const cardinal = DIRS.indexOf(d) % 2 === 0;
      const opts = cardinal ? ['north', 'east', 'south', 'west'] : ['northeast', 'southeast', 'southwest', 'northwest'];
      const cap = (x) => x[0].toUpperCase() + x.slice(1);
      if (acrossPacific(from, r)) {
        return { q: `🧭 You travel from ${nameOf(from)} to ${nameOf(r)} across the Pacific Ocean. Which direction do you go? (Use the compass!)`, opts: opts.map(cap), ans: cap(d),
          explain: `Across the Pacific Ocean, you go ${d}. On the flat map, that means going off one edge and coming back on the other side. Spin the 3D globe to see it!` };
      }
      return { q: `🧭 Which direction is ${nameOf(r)} from ${nameOf(from)}? (Use the compass!)`, opts: opts.map(cap), ans: cap(d),
        explain: `${nameOf(r)} is ${d} of ${nameOf(from)}.` };
    },
    flagReverse(r) {
      const opts = [nameOf(r)];
      for (const c of farAway(r)) { if (!opts.includes(nameOf(c))) opts.push(nameOf(c)); if (opts.length === 4) break; }
      return { q: `Whose flag is this?`, img: M.flag(r), opts: shuffle(opts), ans: nameOf(r), explain: `That is the flag of ${nameOf(r)}.` };
    },
    flag(r) {
      const opts = [r];
      for (const c of farAway(r)) { if (!opts.some((o) => looksLike(o, c))) opts.push(c); if (opts.length === 4) break; }
      return { q: `Which flag belongs to ${nameOf(r)}?`, opts: shuffle(opts), ans: r, kind: 'flag', explain: `Now you know the flag of ${nameOf(r)}!` };
    },
    bird(r) { // USA easy: the state bird is on the card
      const c = choices(r, (s) => info(s)[5].split(' (')[0]);
      return { q: `What is the state bird of ${nameOf(r)}?`, ...c, explain: `The state bird of ${nameOf(r)} is the ${c.ans.toLowerCase()}.` };
    },
    capitalReverse(r) {
      const cap = shortCap(r); const opts = [nameOf(r)];
      for (const c of farAway(r)) { if (shortCap(c) !== cap && !opts.includes(nameOf(c))) opts.push(nameOf(c)); if (opts.length === 4) break; }
      return { q: `${cap} is the capital of which ${M.unit}?`, opts: shuffle(opts), ans: nameOf(r), explain: `${cap} is the capital of ${nameOf(r)}.` };
    },
    placeReverse(r) {
      const place = extra(r)[0]; const opts = [nameOf(r)];
      for (const c of farAway(r)) { if (!opts.includes(nameOf(c))) opts.push(nameOf(c)); if (opts.length === 4) break; }
      return { q: `Where would you find ${withThe(place, NEEDS_THE_PLACE)}?`, photo: placePic(r, 'quiz-photo'), opts: shuffle(opts), ans: nameOf(r), explain: `${place} is in ${nameOf(r)}.` };
    },
    capital(r) {
      const c = choices(r, shortCap);
      return { q: `What is the capital of ${nameOf(r)}?`, ...c, explain: `The capital of ${nameOf(r)} is ${c.ans}.` };
    },
    language(r) {
      const own = (info(r)[2] + ', ' + info(r)[3]).toLowerCase();
      const c = choices(r, mainLang, (_, v) => !own.includes(v.toLowerCase()));
      return { q: `What language do most people speak in ${nameOf(r)}?`, ...c, explain: `People in ${nameOf(r)} speak ${info(r)[2]}.` };
    },
    nickname(r) {
      const c = choices(r, (s) => info(s)[2]);
      return { q: `What is the nickname of ${nameOf(r)}?`, ...c, explain: `${nameOf(r)} is “${c.ans}.”` };
    },
    place(r) {
      const c = choices(r, (s) => extra(s)[0]);
      const owner = {}; for (const x of regions) owner[extra(x)[0]] = x;
      return { q: `Which famous place is in ${nameOf(r)}?`, ...c, optPic: (o) => placePic(owner[o], 'opt-pic'), explain: `${c.ans} is in ${nameOf(r)}.` };
    },
    tradition(r) {
      const c = choices(r, (s) => extra(s)[1]);
      return { q: `Which of these is ${nameOf(r)} famous for?`, ...c, explain: `${nameOf(r)} is famous for ${c.ans}.` };
    }
  };
  function buildQuestions(enemy, clicked) {
    const cats = settings.cats.filter((c) => CATS[c]);
    const turn = S.qTurn || 0; S.qTurn = turn + 1; save();
    let kinds;
    if (cats.length === 1) kinds = shuffle(CATS[cats[0]].kinds).slice(0, 2); // one topic: two of its question kinds
    else { // several topics: two different topics each battle, taking turns
      const first = { capitals: 'capital', orientation: pick(['continent', 'hemisphere', 'direction']), landmarks: 'place', geography: pick(['land', 'animal']), flags: pick(['flag', 'flagReverse']) };
      kinds = [first[cats[turn % cats.length]], first[cats[(turn + 1) % cats.length]]];
    }
    return kinds.map((k) => Qs[k](clicked));
  }

  function versusHTML(enemy) {
    const mine = regionsOf(S.player).length, theirs = regionsOf(enemy).length;
    return `<div class="versus">
      <div class="side"><img src="${M.flag(S.player)}" alt=""><div>You: ${esc(nameOf(S.player))}</div><div class="small">${mine} ${mine === 1 ? M.unit : M.units}</div></div>
      <div class="vs">VS</div>
      <div class="side"><img src="${M.flag(enemy)}" alt=""><div>${esc(nameOf(enemy))}</div><div class="small">${theirs} ${theirs === 1 ? M.unit : M.units}</div></div></div>`;
  }

  /* ---------- the fraction wheel ---------- */
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const frac = (m, n) => { const g = gcd(m, n); return `${m / g}/${n / g}`; };
  const pct = (m, n) => `${Math.round(m / n * 1000) / 10}%`.replace('.5%', '.5%');
  const odds = (m, n) => `<b>${pct(m, n)}</b> <small class="frac">(${frac(m, n)})</small>`;
  const enemyWheelColor = (e) => (empireSize(e) > 1 ? empireColor(e) : d3.color(colorAI[e] || '#9aa5b1').darker(1.1).formatHex());
  function wheelSVG(mine, total, enemy) {
    const R = 100, c = 110, me = S.color, them = enemyWheelColor(enemy);
    let out = '';
    for (let i = 0; i < total; i++) {
      const a0 = i / total * 2 * Math.PI, a1 = (i + 1) / total * 2 * Math.PI; // clockwise from the top
      const pt = (a, r) => [(c + r * Math.sin(a)).toFixed(2), (c - r * Math.cos(a)).toFixed(2)];
      const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
      out += `<path d="M${c},${c} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z" fill="${i < mine ? me : them}" stroke="#fff" stroke-width="3"/>`;
      const [tx, ty] = pt((a0 + a1) / 2, R * 0.64);
      out += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" class="slice-label">${i < mine ? '★' : ''}1/${total}</text>`;
    }
    out += `<circle cx="${c}" cy="${c}" r="14" fill="#fff" stroke="#1d2a3a" stroke-width="3"/>`;
    return `<svg viewBox="0 0 220 220" class="wheel" id="wheel" role="img" aria-label="Wheel: you have ${frac(mine, total)}">${out}</svg>`;
  }
  function drawWheel(B, pop) {
    const box = $('#wheelBox');
    box.innerHTML = `<div class="wheel-wrap"><div class="pointer"></div>${wheelSVG(B.mine, B.total, B.enemy)}</div>
      <div class="wheel-key"><span><i style="background:${S.color}"></i>★ You: ${odds(B.mine, B.total)}</span>
      <span><i style="background:${enemyWheelColor(B.enemy)}"></i>${esc(nameOf(B.enemy))}: ${odds(B.total - B.mine, B.total)}</span></div>`;
    if (pop) $('#wheel').animate([{ transform: 'scale(.85)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
  }

  // The wheel is counted in eighths: 4/8 = 50%. Each time you come back after studying, it starts bigger.
  function setOdds(B) { B.m8 = Math.max(1, Math.min(7, B.m8)); const g = gcd(B.m8, 8); B.mine = B.m8 / g; B.total = 8 / g; }
  function startBattle(enemy, clicked, attempt = 0) {
    stopAllSounds(); stopSpeech(); // no leftover sounds when a new battle opens
    const B = { enemy, clicked, attempt, m8: 4 }; // every try starts at 50/50
    setOdds(B);
    const growth = attempt ? `<p class="center growth">🌱 You came back to try again. You’ve got this!</p>` : '';
    openModal(`<h3 class="mtitle">${attempt ? `💪 Try again! (round ${attempt + 1})` : '⚔️ Battle!'}</h3>${versusHTML(enemy)}${growth}<div id="wheelBox"></div><div id="stage"></div>`, { noClose: true });
    card.insertAdjacentHTML('afterbegin', '<span data-lock></span>');
    drawWheel(B);
    if (!settings.cats.length) { spinStage(B); return; }
    const qs = buildQuestions(enemy, clicked);
    askQ(B, qs, 0);
  }

  function askQ(B, qs, i) {
    const Q = qs[i];
    $('#stage').innerHTML = `<p class="center small">🧠 <b>Question ${i + 1} of 2</b> — ${i === 0 ? 'right answers raise your chance of winning! (Hint: the answers are on the card you just read.)' : 'one more chance to raise your odds!'}</p>
      <div class="quiz-q">${esc(Q.q)}</div>${Q.img ? `<img class="quiz-flag" src="${Q.img}" alt="A flag">` : ''}${Q.photo || ''}
      <div class="help-row"><span>Not sure? Look it up!</span><button class="chip" id="peekCard">📖 Look at the card</button><button class="chip" id="peekMap">🗺️ View map</button></div>
      <div class="quiz-opts">${Q.opts.map((o, k) => `<button data-k="${k}">${Q.kind === 'flag' ? `<img src="${M.flag(o)}" alt="A flag">` : Q.pics ? `${pic(o, 'opt-pic')}<span>${esc(o)}</span>` : Q.optPic ? `${Q.optPic(o)}<span>${esc(o)}</span>` : esc(o)}</button>`).join('')}</div>
      <div id="qres"></div>`;
    $('#peekCard').onclick = () => peekCard(B);
    $('#peekMap').onclick = () => peekMap(B);
    const btns = card.querySelectorAll('.quiz-opts button');
    btns.forEach((b) => b.onclick = () => {
      card.querySelectorAll('.help-row button').forEach((x) => (x.disabled = true));
      const right = Q.opts[+b.dataset.k] === Q.ans;
      btns.forEach((x) => { x.disabled = true; if (Q.opts[+x.dataset.k] === Q.ans) x.classList.add('right'); });
      if (!right) b.classList.add('wrong');
      right ? sfx.right() : sfx.wrong();
      B.m8 += right ? 2 : -2; setOdds(B); // every answer moves the wheel the same amount, so one right and one wrong always lands back at 50/50 (the wheel never goes past 7/8 or below 1/8)
      B.asked = (B.asked || 0) + 1; if (!right) B.missed = (B.missed || 0) + 1;
      drawWheel(B, true);
      const fact = Q.explain;
      $('#qres').innerHTML = `<div class="odds">${right ? `✅ Correct! ${esc(fact)}<br>Your chance grows to ${odds(B.mine, B.total)}!`
        : `❌ Not quite. ${esc(fact)}<br>${esc(nameOf(B.enemy))}’s chance grows to ${odds(B.total - B.mine, B.total)}.`}</div>
        <div class="btn-row"><button class="btn primary" id="qNext">${i === 0 ? 'Next question →' : 'Get ready to spin! 🎡'}</button></div>`;
      $('#qNext').onclick = () => (i === 0 ? askQ(B, qs, 1) : spinStage(B));
    });
  }

  // 📖 Look at the card without leaving the battle
  function peekCard(B) {
    sfx.click();
    const panel = document.createElement('div'); panel.className = 'peek';
    panel.innerHTML = `<button class="btn gold back-q" id="backQ">↩ Back to the question</button>${cardHTML(B.clicked, nextFact(B.clicked))}<button class="btn gold back-q" id="backQ2">↩ Back to the question</button>`;
    $('#wheelBox').hidden = true; $('#stage').hidden = true; card.appendChild(panel); card.scrollTop = 0;
    const hi = panel.querySelector('#sayHi'); if (hi) hi.onclick = () => sayHello(B.clicked);
    wireSay(B.clicked, panel);
    const back = () => { stopSpeech(); panel.remove(); $('#wheelBox').hidden = false; $('#stage').hidden = false; $('#stage').scrollIntoView({ block: 'center' }); };
    panel.querySelector('#backQ').onclick = back; panel.querySelector('#backQ2').onclick = back;
  }
  // 🗺️ Peek at the map (hover or tap places to see their names), then come back to the same question
  function peekMap(B) {
    sfx.click();
    peekingMap = true; modal.hidden = true;
    map.flyTo(B.clicked);
    banner('🗺️ Look around the map, then tap “Back to the question”');
    const btn = document.createElement('button'); btn.className = 'btn gold back-to-q'; btn.textContent = '↩ Back to the question';
    btn.onclick = () => { btn.remove(); peekingMap = false; banner(null); modal.hidden = false; };
    $('#mapwrap').appendChild(btn);
  }

  function spinStage(B) {
    $('#stage').innerHTML = `<p class="center">Your chance to win: ${odds(B.mine, B.total)}. ${esc(nameOf(B.enemy))}’s chance: ${odds(B.total - B.mine, B.total)}.</p>
      <div id="flipOut"><div class="btn-row"><button class="btn gold" id="spinBtn">🎡 SPIN!</button></div></div>`;
    $('#spinBtn').onclick = () => {
      $('#spinBtn').disabled = true;
      const win = Math.random() < B.mine / B.total;
      // land somewhere inside one of the winner's slices (not right on a line)
      const idx = win ? (Math.random() * B.mine) | 0 : B.mine + ((Math.random() * (B.total - B.mine)) | 0);
      const a = (idx + 0.2 + Math.random() * 0.6) * 360 / B.total;
      const rot = 360 * 6 + (360 - a);
      sfx.spin();
      $('#wheel').animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${rot}deg)` }], { duration: 3400, easing: 'cubic-bezier(.12,.65,.2,1)', fill: 'forwards' });
      setTimeout(() => resolveBattle(B, win), 3600);
    };
  }

  function resolveBattle(B, win) {
    const enemy = B.enemy;
    S.battles++;
    const out = $('#flipOut');
    if (win) {
      const taken = regionsOf(enemy);
      for (const r of taken) { S.own[r] = S.player; if (!S.conquered.includes(r)) S.conquered.push(r); }
      S.recent = (S.recent || []).filter((r) => !taken.includes(r)).concat(taken);
      S.wins++; S.log.push(['win', enemy, taken.length]);
      if (B.attempt) S.comebacks = (S.comebacks || 0) + 1;
      save(); sfx.win(); confetti(80);
      const done = regionsOf(S.player).length === regions.length;
      out.innerHTML = `<div class="result win">${B.attempt ? '💪 What a comeback! You win!' : '🎉 The wheel landed on YOU! You win!'}</div>
        <p class="center">${B.attempt ? 'You studied, tried again, and came back stronger! ' : ''}You take over ${taken.length > 1 ? `all ${taken.length} ${M.units} of ${esc(nameOf(enemy))}’s empire` : esc(nameOf(enemy))}!</p>
        <div class="btn-row"><button class="btn go" id="resOk">${done ? '🏆 See your victory!' : 'Keep conquering! ⚔️'}</button></div>`;
      $('#resOk').onclick = () => {
        closeModal(); refresh(); map.pulse(taken);
        if (done) { S.phase = 'won'; save(); showWin(); }
        else banner(`${regionsOf(S.player).length} / ${regions.length} ${M.units} are yours!`, 3500);
      };
    } else {
      // Redemption. No-loss mode: nothing is lost. Real stakes: the opponent takes your newest place (never your home).
      let lostPlace = null;
      if (settings.stakes === 'real') {
        const recent = S.recent || [];
        for (let i = recent.length - 1; i >= 0; i--) { const r = recent[i]; if (S.own[r] === S.player && r !== S.player) { lostPlace = r; break; } }
        if (lostPlace) { S.own[lostPlace] = enemy; S.recent = recent.filter((r) => r !== lostPlace); }
      }
      S.log.push(['retry', enemy, lostPlace]); save(); sfx.lose();
      const what = lostPlace ? `${esc(nameOf(enemy))} took ${esc(nameOf(lostPlace))} from you.` : 'Your land is safe.';
      // Say what actually happened: a missed question is something to learn from; a perfect quiz that still lost is just luck.
      const perfect = B.asked && !B.missed;
      const why = perfect ? `You answered every question right. 🌟 The wheel just didn’t land your way.`
        : !B.asked ? `The wheel didn’t land your way.`
        : `🌱 Study ${esc(nameOf(B.clicked))}’s card and try again.`;
      out.innerHTML = `<div class="result lose">Not this time.</div>
        <p class="center">It’s okay to feel disappointed. ${what}<br>${why}</p>
        <div class="btn-row"><button class="btn ghost" id="retreat">Choose another place</button>${perfect || !B.asked
          ? `<button class="btn go" id="again">${B.asked ? '🧠 Earn another try' : '⚔️ Try again'}</button>` : '<button class="btn go" id="study">📖 Study &amp; try again</button>'}</div>`;
      const after = () => { if (lostPlace) { refresh(); map.pulse([lostPlace]); } };
      $('#retreat').onclick = () => { closeModal(); after(); banner('No problem! Pick any place to challenge. 🌍', 3500); };
      if ($('#study')) $('#study').onclick = () => { closeModal(); after(); onRegionClick(B.clicked, null, { study: { enemy, attempt: B.attempt + 1 } }); };
      if ($('#again')) $('#again').onclick = () => { closeModal(); after(); startBattle(enemy, B.clicked, B.attempt + 1); };
    }
  }

  /* ================= RESPAWN ================= */
  function respawnPrompt() {
    banner(`Tap a ${M.unit} to respawn as it`);
    const em = [...empires().entries()].filter(([e]) => e !== S.lastBeatBy).sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])));
    openModal(`<h3 class="mtitle">Respawn!</h3>
      <p class="center">Choose who to play as next. You can only pick ${M.units} that still exist — if one was taken over, you get its whole empire.</p>
      <div class="respawn-list">${em.map(([e, n]) => `<button data-e="${e}"><img src="${M.flag(e)}" alt="">${esc(nameOf(e))}${n > 1 ? ` (${n})` : ''}</button>`).join('')}</div>
      <p class="small center">Or close this and tap one on the map to learn about it first.</p>`, { wide: true });
    card.querySelectorAll('.respawn-list button').forEach((b) => b.onclick = () => { closeModal(); onRegionClick(b.dataset.e); });
  }
  function doRespawn(e) {
    S.player = e; S.phase = 'play'; S.lastBeatBy = null; save();
    closeModal(); refresh(); map.pulse(regionsOf(e)); sfx.win();
    banner(`You are now ${empireLabel(e)}! Keep going!`, 4000);
  }

  /* ================= END SCREENS ================= */
  function statsHTML() {
    return `<div class="pp-stats"><div>⚔️ ${S.battles} ${S.battles === 1 ? 'battle' : 'battles'}</div><div>🏆 ${S.wins} ${S.wins === 1 ? 'win' : 'wins'}</div><div>💪 ${S.comebacks || 0} ${S.comebacks === 1 ? 'comeback' : 'comebacks'}</div><div>🗺️ ${S.visited.length} / ${regions.length} visited</div></div>`;
  }
  function showWin() {
    banner(null); confetti(220); sfx.win();
    // personal best: fewest battles to conquer everything (kids compete with their past selves)
    const bestKey = 'lymanWD_best_' + M.key, best = store.get(bestKey);
    const newRecord = !best || S.battles < best.battles;
    if (newRecord && !S.recordSaved) { store.set(bestKey, { battles: S.battles, comebacks: S.comebacks || 0 }); S.recordSaved = true; save(); }
    const recordHTML = newRecord ? `<p class="center record">🥇 New personal best: ${S.battles} battles! Can you beat it next time?</p>`
      : `<p class="center record">Your best is ${best.battles} battles. This time: ${S.battles}. Can you beat your record next time?</p>`;
    openModal(`<div style="text-align:center;font-size:64px">🏆</div><h3 class="mtitle">You conquered ${M.key === 'us' ? 'the USA' : 'the WORLD'}!</h3>
      <p class="center">All ${regions.length} ${M.units} belong to ${esc(nameOf(S.player))}. Amazing!</p>${statsHTML()}${recordHTML}
      <div class="btn-row" style="margin-top:16px"><button class="btn ghost" id="wPass">🛂 Passport</button><button class="btn go" id="wAgain">Play again</button></div>${supportHTML()}`, { wide: true });
    $('#wAgain').onclick = () => { closeModal(); store.del(SAVE_KEY(M.key)); showTitle(); };
    $('#wPass').onclick = () => showPassport();
  }
  function showGameOver() {
    banner(null);
    openModal(`<div style="text-align:center;font-size:64px">🏳️</div><h3 class="mtitle">Game over</h3>
      <p class="center">There are no ${M.units} left to respawn as — ${esc(nameOf(S.lastBeatBy))} rules everything!</p>${statsHTML()}
      <div class="btn-row" style="margin-top:16px"><button class="btn go" id="gAgain">Try again</button></div>`, { wide: true });
    $('#gAgain').onclick = () => { closeModal(); store.del(SAVE_KEY(M.key)); startMode(M.key, null); };
  }

  /* ================= PASSPORT ================= */
  function showPassport() {
    const c = new Set(S.conquered);
    openModal(`<h3 class="mtitle">🛂 My Passport</h3>
      <p class="center small">Every ${M.unit} is in your passport. Flags stay gray until you conquer them — then they get full color and a stamp! Tap any flag to visit it.</p>
      ${statsHTML()}
      <div class="pp-grid">${regions.map((r) => `<button class="pp ${c.has(r) ? '' : 'locked'}" data-r="${r}"><img src="${M.flag(r)}" alt="" loading="lazy">${c.has(r) ? '<span class="stamp">CONQUERED</span>' : ''}<div>${esc(nameOf(r))}</div></button>`).join('')}</div>`, { wide: true });
    card.querySelectorAll('.pp').forEach((b) => b.onclick = () => { closeModal(); map.flyTo(b.dataset.r); setTimeout(() => onRegionClick(b.dataset.r), 700); });
  }

  /* ================= INSTALL AS AN APP ================= */
  let installPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMacSafari = !isIOS && /Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent);
  const canInstall = () => !isStandalone() && (installPrompt || isIOS || isMacSafari);
  function updateInstallBtn() { $('#installBtn').hidden = !canInstall() || $('#title').hidden; }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; updateInstallBtn(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; updateInstallBtn(); });
  async function doInstall() {
    sfx.click();
    if (installPrompt) { installPrompt.prompt(); try { await installPrompt.userChoice; } catch (e) { /* ignore */ } installPrompt = null; updateInstallBtn(); return; }
    const steps = isIOS
      ? '<ol><li>Tap the <b>Share</b> button <span style="font-size:20px">⬆️</span> (a square with an arrow, at the bottom or top of Safari).</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. The game appears on your home screen like an app!</li></ol>'
      : '<ol><li>In Safari’s menu bar, click <b>File</b>.</li><li>Click <b>Add to Dock</b>.</li><li>Click <b>Add</b>. The game opens from your Dock like an app!</li></ol>';
    openModal(`<div style="text-align:center"><img src="icons/icon-192.png" alt="" style="width:96px;border-radius:22px;box-shadow:var(--shadow)"></div>
      <h3 class="mtitle">Get the app</h3>${steps}<p class="small center">It’s free, works offline, and keeps your saved games.</p>
      <div class="btn-row"><button class="btn gold" data-close>Got it!</button></div>`);
  }
  $('#installBtn').addEventListener('click', doInstall);

  /* ✈️ Airplane-mode badge: shows when every game file is saved on this device */
  let offlineReady = false, offlineTimer = null;
  async function offlineStatus() {
    const O = self.LYMAN_OFFLINE;
    if (!O || !('caches' in window) || !('serviceWorker' in navigator) || location.protocol === 'file:') return null;
    const have = new Set((await (await caches.open(O.version)).keys()).map((r) => r.url));
    const n = O.files.filter((f) => have.has(new URL(f, location.href).href)).length;
    return { n, total: O.files.length };
  }
  async function updateOfflineBadge() {
    const b = $('#offlineBadge'); let st = null;
    try { st = await offlineStatus(); } catch (e) { st = null; }
    if (!st) { b.hidden = true; return; }
    offlineReady = st.n >= st.total;
    b.classList.toggle('ready', offlineReady);
    b.textContent = offlineReady ? '✈️ Ready for airplane mode' : `⏳ Saving for airplane mode… ${Math.floor(st.n / st.total * 100)}%`;
    b.hidden = $('#title').hidden;
    if (!offlineReady && navigator.onLine && navigator.serviceWorker.controller && !offlineTimer) navigator.serviceWorker.controller.postMessage('save-all');
    clearTimeout(offlineTimer); offlineTimer = offlineReady ? null : setTimeout(() => { offlineTimer = null; updateOfflineBadge(); }, 1500);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // When a new version of the game is published, the app downloads it in the background and then
    // reloads itself once — right away if nothing is in progress, otherwise as soon as the popup closes.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    window.__pendingUpdate = false;
    const applyUpdate = () => { if (reloading) return; reloading = true; location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return; // first install, nothing to refresh
      if (modal.hidden) applyUpdate(); else window.__pendingUpdate = true;
    });
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => { reg.update().catch(() => {}); document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); }); })
      .catch(() => { /* offline mode unavailable */ }).finally(updateOfflineBadge));
  }

  /* ================= BOOT ================= */
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  showTitle();
  // the map always starts right under the top bar, even when the bar wraps onto two lines
  if (window.ResizeObserver) new ResizeObserver(syncHud).observe($('#hud'));
  window.addEventListener('resize', syncHud);
  setTimeout(warmUp, 400); // start getting the maps ready right after the title screen appears
})();
