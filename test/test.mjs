import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';

const APP = new URL('../index.html', import.meta.url);
const KEY = 'litery.child.v2';

let pass = 0, fail = 0;
const ok = (c, m, x='') => { c ? (pass++, console.log('  ✓ ' + m))
                               : (fail++, console.log('  ✗ ' + m + (x ? '   <- ' + x : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// tap a button, wait past the 400ms feedback, and report what it was
async function probe(a, i) {
  a.clear();
  a.clickBtn(i);
  await sleep(600);
  const b = a.d.querySelectorAll('#opts .opt')[i];
  return { dead: b.classList.contains('dead'), good: b.classList.contains('good'), said: a.said() };
}
// keep answering until we manage to hit a WRONG one, then hand it back
async function findWrong(a, tries = 8) {
  for (let n = 0; n < tries; n++) {
    for (const i of [0, 1]) {
      if (a.screen() !== 'play') return null;   // round ended; nothing to probe
      const r = await probe(a, i);
      if (r.dead) return r;
      if (r.good) { await sleep(1800); break; }   // advanced to a new question
    }
  }
  return null;
}

function boot(seed, query, pre) {
  const dom = new JSDOM(readFileSync(APP, 'utf8'), {
    runScripts: 'dangerously',
    url: 'http://localhost/' + (query || ''),
    pretendToBeVisual: true,
    beforeParse(w) {
      try {
        if (!('name' in seed)) seed = Object.assign({ name: 'Ada' }, seed);
        w.localStorage.setItem(KEY, JSON.stringify(seed));
        if (seed.__log)     w.localStorage.setItem('litery.child.log', JSON.stringify(seed.__log));
        if (seed.__mastery) w.localStorage.setItem('litery.child.mastery', JSON.stringify(seed.__mastery));
      } catch (e) {}
      w.__said = [];
      w.SpeechSynthesisUtterance = function (t) { this.text = t; };
      Object.defineProperty(w, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => ([{ name: 'PL', lang: 'pl-PL', localService: true },
                             { name: 'NB', lang: 'nb-NO', localService: true }]),
          speak: u => { w.__said.push(u.text); w.__rates = w.__rates || []; w.__rates.push(u.rate); },
          cancel: () => {}, onvoiceschanged: null
        }
      });
      if (pre) pre(w);
    }
  });
  const w = dom.window, d = w.document;
  return {
    w, d,
    said:   () => w.__said.slice(),
    clear:  () => { w.__said.length = 0; },
    screen: () => ['setup','profile','welcome','lang','board','play','reward','parent','stats']
                    .find(id => d.getElementById(id).classList.contains('on')),
    tiles:  () => [...d.querySelectorAll('#word .cell')]
                    .map(c => c.classList.contains('gap') && !c.textContent ? '_' : c.textContent),
    btns:   () => [...d.querySelectorAll('#opts .opt')].map(b => b.textContent),
    dead:   () => [...d.querySelectorAll('#opts .opt')].filter(b => b.classList.contains('dead')).length,
    count:  () => d.querySelectorAll('#pic .cnt span').length,
    click:  sel => d.querySelector(sel).click(),
    clickBtn: i => d.querySelectorAll('#opts .opt')[i].click()
  };
}

function rebuildLike(log){
  const M = {};
  log.filter(r => r.k === 'L' || r.k === 'N').sort((a,b)=>a.t-b.t).forEach(r => {
    const id = r.l + ':' + r.k + ':' + r.x;
    const m = M[id] || { n:0, ft:0, box:1, streak:0, last:0, ms:[] };
    m.n++;
    if (!r.w) { m.ft++; m.streak++; m.box = Math.min(5, m.box+1); }
    else { m.streak = 0; m.box = 1; }
    m.last = r.t; m.ms.push(r.ms); if (m.ms.length > 10) m.ms.shift();
    M[id] = m;
  });
  return M;
}

const PL_NUMS = /jeden|dwa|trzy|cztery|pięć|sześć|siedem|osiem|dziewięć|dziesięć/;
const NB_NUMS = /\b(en|to|tre|fire|fem|seks|sju|åtte|ni|ti)\b/;

(async () => {

console.log('\n[1] LETTERS — greeting, auto-speak, wrong-answer phrase');
{
  const a = boot({ rate:.8, goal:30, lang:'pl', mode:'letters', prizes:[], day:'' });
  await sleep(120);
  console.log('  build on page: ' + a.d.getElementById('build').textContent);

  a.click('#pick-profile'); await sleep(60);
  ok(a.screen() === 'welcome', 'tapping her name opens the welcome');
  ok(a.said().some(x=>/cześć ada/i.test(x)), 'welcome speaks her name', JSON.stringify(a.said()));

  await sleep(2300);
  ok(a.screen() === 'lang', 'welcome moves on to the flags by itself');

  a.clear();
  a.click('.flag[data-lang="pl"]'); await sleep(80);
  ok(a.screen() === 'play', 'choosing a flag starts the game');
  ok(a.said().length > 0, 'THE FIRST PICTURE SPEAKS ITSELF', JSON.stringify(a.said()));

  console.log('  question ' + a.tiles().join('') + '  buttons ' + a.btns().join(' '));
  ok(a.tiles()[0] === '_', 'the first letter is the gap');

  const wrong = await findWrong(a);
  if (wrong) {
    console.log('  wrong tap said: ' + JSON.stringify(wrong.said));
    ok(wrong.said.length === 1 && / jak /.test(wrong.said[0]),
       'WRONG TAP SAYS "<letter> jak <word>", not just the word', JSON.stringify(wrong.said));
  } else { fail++; console.log('  \u2717 could not provoke a wrong answer in 8 tries'); }
  a.w.close();
}

console.log('\n[2] NUMBERS — do they exist at all');
{
  const a = boot({ rate:.8, goal:30, lang:'pl', mode:'numbers', prizes:[], day:'' });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2400);
  a.clear();
  a.click('.flag[data-lang="pl"]'); await sleep(80);

  const n = a.count();
  console.log('  objects ' + n + '  tiles ' + a.tiles().join('') + '  buttons ' + a.btns().join(' '));
  ok(n >= 1 && n <= 10, 'A COUNTABLE GROUP OF OBJECTS IS DRAWN', 'count=' + n);
  ok(a.tiles().length === 1 && a.tiles()[0] === '_', 'one empty tile for the digit');
  ok(a.btns().every(x => /^\d+$/.test(x)), 'both buttons are digits', JSON.stringify(a.btns()));
  ok(a.btns().includes(String(n)), 'the correct digit is one of them', n + ' vs ' + JSON.stringify(a.btns()));
  ok(a.said().some(x => PL_NUMS.test(x)), 'the number is spoken in Polish', JSON.stringify(a.said()));

  const wn = await findWrong(a);
  if (wn) {
    console.log('  wrong digit said: ' + JSON.stringify(wn.said));
    ok(wn.said.length === 1 && PL_NUMS.test(wn.said[0]),
       'a wrong digit is named out loud', JSON.stringify(wn.said));
  } else { fail++; console.log('  \u2717 could not provoke a wrong digit'); }

  a.w.close();
}

console.log('\n[3] A FULL ROUND — reward, prize board, back');
{
  const a = boot({ rate:.8, goal:3, lang:'pl', mode:'numbers', prizes:[], day:'' });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2400);
  a.click('.flag[data-lang="pl"]'); await sleep(80);

  for (let i = 0; i < 8 && a.screen() === 'play'; i++) {
    const idx = a.btns().indexOf(String(a.count()));
    a.clickBtn(idx < 0 ? 0 : idx);
    await sleep(1850);
  }
  ok(a.screen() === 'reward', 'three right answers reach the prize', 'ended on ' + a.screen());
  ok(a.d.getElementById('book').children.length > 0, 'the prize is added to the collection');

  a.click('#toboard'); await sleep(60);
  ok(a.screen() === 'board', 'the trophy button opens the prize board');
  ok(!a.d.getElementById('bback'), 'the redundant go-back button is gone');
  a.click('#backx'); await sleep(60);
  // opened from the reward screen, so back belongs there — returning to 'play'
  // was the trap: finish() leaves the last question answered and locked
  ok(a.screen() === 'reward', 'the back arrow returns where the board was opened from',
     'landed on ' + a.screen());
  a.w.close();
}

console.log('\n[4] LANGUAGE — switchable after a round');
{
  const a = boot({ rate:.8, goal:3, lang:'pl', mode:'numbers', prizes:[], day:'' });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2400);
  a.click('.flag[data-lang="pl"]'); await sleep(80);
  for (let i = 0; i < 8 && a.screen() === 'play'; i++) {
    const idx = a.btns().indexOf(String(a.count()));
    a.clickBtn(idx < 0 ? 0 : idx); await sleep(1850);
  }
  ok(a.screen() === 'reward', 'reached the reward screen');
  const flag = a.d.getElementById('swaplang').textContent;
  ok(flag === '🇳🇴', 'the reward screen offers the OTHER language', 'shows ' + flag);

  a.clear();
  a.click('#swaplang'); await sleep(80);
  ok(a.screen() === 'play', 'tapping it starts a new round');
  ok(a.said().some(x => /hei ada/i.test(x)), 'and greets her in Norwegian', JSON.stringify(a.said()));
  await sleep(1600);
  ok(a.said().some(x => NB_NUMS.test(x)), 'the question is now Norwegian', JSON.stringify(a.said()));
  a.w.close();
}

console.log('\n[5] NORWEGIAN LETTERS — the phrase in the other language');
{
  const a = boot({ rate:.8, goal:30, lang:'nb', mode:'letters', prizes:[], day:'' });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2400);
  // she was already greeted in Norwegian on the welcome screen, so the app
  // correctly does NOT repeat itself here — it goes straight to the question
  ok(a.said().some(x => /hei ada/i.test(x)), 'welcome greeted her in Norwegian', JSON.stringify(a.said()));
  a.clear();
  a.click('.flag[data-lang="nb"]'); await sleep(80);
  ok(a.said().length > 0 && !/hei ada/i.test(a.said()[0]),
     'same language chosen -> no duplicate greeting, straight to the word', JSON.stringify(a.said()));
  const wnb = await findWrong(a);
  if (wnb) {
    console.log('  wrong tap said: ' + JSON.stringify(wnb.said));
    ok(/ som i /.test(wnb.said[0] || ''), 'wrong tap says "<letter> som i <word>"', JSON.stringify(wnb.said));
  } else { fail++; console.log('  \u2717 could not provoke a wrong answer'); }

  a.w.close();
}

console.log('\n[6] TAPPABLE LETTERS + the prizes I destroyed');
{
  // the hardcoded prize repair is gone: an existing collection is left alone
  const a = boot({ rate:.8, goal:3, lang:'pl', mode:'letters',
                   prizes:['🍭','🦖','⭐️'], day:'', restoredV:1 });
  await sleep(150);
  const got = JSON.parse(a.w.localStorage.getItem('litery.child.v2')).prizes;
  ok(got.length === 3, 'an existing collection is never topped up behind her back',
     JSON.stringify(got));
  a.w.close();
}
{
  const a = boot({ rate:.8, goal:3, lang:'pl', mode:'letters', prizes:[], day:'' });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2400);
  a.click('.flag[data-lang="pl"]'); await sleep(120);

  const tappable = a.d.querySelectorAll('#word .cell.tappable').length;
  const total    = a.d.querySelectorAll('#word .cell').length;
  console.log('  word ' + a.tiles().join('') + '  tappable ' + tappable + '/' + total);
  ok(tappable === total - 1, 'every letter except the gap is tappable');

  a.clear();
  a.d.querySelector('#word .cell.tappable').click();
  await sleep(80);
  console.log('  tile tap said: ' + JSON.stringify(a.said()));
  ok(a.said().length === 1, 'tapping a letter speaks exactly once', JSON.stringify(a.said()));
  ok(/ jak |^(ser|sok|sowa|słoń|sól|but|byk|brat|tort|tata|tir)$/.test(a.said()[0] || ''),
     'it says "<letter> jak <word>" (or the word, for ń/ó/y)', JSON.stringify(a.said()));

  const got = JSON.parse(a.w.localStorage.getItem('litery.child.v2')).prizes;
  console.log('  prizes after boot: ' + JSON.stringify(got));
  ok(got.length === 0,
     'a blank device starts with an empty album, not an invented one',
     JSON.stringify(got));
  a.w.close();
}

{
  // and the restore must NOT fire a second time or re-add on top of real wins
  const a = boot({ rate:.8, goal:3, lang:'pl', mode:'letters',
                   prizes:['🌈'], day:'', restoredV:2 });
  await sleep(150);
  const got = JSON.parse(a.w.localStorage.getItem('litery.child.v2')).prizes;
  ok(got.length === 1 && got[0] === '🌈', 'the restore never runs twice', JSON.stringify(got));
  a.w.close();
}

console.log('\n[7] LOGGING + PARENT TEST RUN');
{
  const a = boot({ rate:.8, goal:3, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2 });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2400);
  a.click('.flag[data-lang="pl"]'); await sleep(80);

  // answer one question correctly, having asked to hear it twice first
  a.d.getElementById('pic').click();
  a.d.getElementById('pic').click();
  await sleep(400);
  let logged = false;
  for (let n = 0; n < 8 && a.screen() === 'play' && !logged; n++) {
    const before = JSON.parse(a.w.localStorage.getItem('litery.child.log') || '[]').length;
    a.clickBtn(n % 2); await sleep(700);
    const after = JSON.parse(a.w.localStorage.getItem('litery.child.log') || '[]');
    if (after.length > before) {
      const r = after[after.length - 1];
      console.log('  logged row: ' + JSON.stringify(r));
      ok(r.l === 'pl' && r.k === 'L', 'row records language and kind');
      ok(typeof r.ms === 'number' && r.ms > 0, 'row records how long she took', 'ms=' + r.ms);
      ok(r.h >= 2, 'row records that she asked to hear the picture', 'h=' + r.h);
      ok('w' in r && 'x' in r && 'd' in r, 'row records target, distractor and wrong taps');
      const m = JSON.parse(a.w.localStorage.getItem('litery.child.mastery'));
      const key = Object.keys(m)[0];
      console.log('  mastery: ' + key + ' -> ' + JSON.stringify(m[key]));
      ok(m[key].n === 1 && m[key].box >= 1, 'mastery box opened for that letter');
      logged = true;
      break;
    }
    await sleep(1400);
  }
  if (!logged) { fail++; console.log('  \u2717 no row was ever logged'); }
  a.w.close();
}

{
  // a parent test run must leave every persisted number untouched
  const a = boot({ rate:.8, goal:2, lang:'pl', mode:'numbers', prizes:['🌈'], day:'', restoredV:2 });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2400);
  a.click('.flag[data-lang="pl"]'); await sleep(80);
  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  ok(a.screen() === 'parent', 'long press opens the parent panel');
  a.click('#practicebtn');
  ok(a.d.getElementById('practicebtn').textContent.includes('ON'), 'test run switches on');
  a.click('#pback'); await sleep(60);
  ok(a.d.getElementById('practiceband').style.display === 'block', 'a banner says it is a test run');

  const logBefore = (JSON.parse(a.w.localStorage.getItem('litery.child.log') || '[]')).length;
  for (let i = 0; i < 6 && a.screen() === 'play'; i++) {
    const idx = a.btns().indexOf(String(a.count()));
    a.clickBtn(idx < 0 ? 0 : idx); await sleep(1850);
  }
  const logAfter = (JSON.parse(a.w.localStorage.getItem('litery.child.log') || '[]')).length;
  const saved = JSON.parse(a.w.localStorage.getItem('litery.child.v2'));
  console.log('  log rows ' + logBefore + ' -> ' + logAfter + ', prizes ' + JSON.stringify(saved.prizes));
  ok(logAfter === logBefore, 'a test run writes NOTHING to the log', logBefore + ' -> ' + logAfter);
  ok(saved.prizes.length === 1, 'a test run awards no prize', JSON.stringify(saved.prizes));
  ok((saved.asked || 0) === 0, 'a test run does not count toward her day', 'asked=' + saved.asked);
  a.w.close();
}

console.log('\n[8] PARENT DASHBOARD');
{
  const day = 86400000, now = Date.now();
  const log = [], mastery = {
    'pl:L:s': { n:28, ft:26, box:5, streak:6, last:now, ms:[2100,2600,2400] },
    'pl:L:b': { n:17, ft:9,  box:2, streak:0, last:now, ms:[3100,3600,3400] },
    'pl:N:3': { n:14, ft:13, box:5, streak:4, last:now, ms:[1900,2200] }
  };
  for (let d = 0; d < 3; d++) {
    for (let i = 0; i < 10; i++)
      log.push({ t:now-d*day, l:'pl', k:'L', s:1, x:'s', d:'b', o:2, w:(i%4?0:1), ms:2200, h:0, c:0 });
    log.push({ t:now-d*day, l:'pl', k:'P', x:'⭐️' });
  }

  const a = boot({ rate:.8, goal:20, lang:'pl', mode:'letters', prizes:[], day:'',
                   restoredV:2, __log:log, __mastery:mastery });
  await sleep(150);
  a.click('#pick-profile'); await sleep(2400);
  a.click('.flag[data-lang="pl"]'); await sleep(80);

  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  ok(a.screen() === 'parent', 'parent panel opens');
  a.click('#statsbtn'); await sleep(80);
  ok(a.screen() === 'stats', 'the dashboard opens from the parent panel');

  const items = a.d.querySelectorAll('#sbody .item').length;
  const rows  = a.d.querySelectorAll('#sbody .dtab tr').length;
  const heads = [...a.d.querySelectorAll('#sbody .shead')].map(h => h.textContent);
  console.log('  sections: ' + JSON.stringify(heads));
  console.log('  item rows ' + items + ', day rows ' + rows);
  ok(heads.some(h => /Letters · Polish — 1\/2 known/.test(h)),
     'it says how many letters she actually knows', JSON.stringify(heads));
  ok(heads.some(h => /Numbers · Polish/.test(h)), 'numbers are broken out separately');
  ok(rows === 3, 'one row per day she played', 'rows=' + rows);
  ok(heads.some(h => /clears at 80% on two days/i.test(h)),
     'it shows the advancement rule you chose', JSON.stringify(heads));

  const firstDay = a.d.querySelector('#sbody .dtab tr').textContent;
  console.log('  latest day: ' + firstDay);
  ok(/10 q/.test(firstDay) && /70% first try/.test(firstDay) && /1 prize/.test(firstDay),
     'the day row counts questions, first-try rate and prizes', firstDay);

  a.click('#copydata'); await sleep(60);
  const dumped = a.d.getElementById('dump').value;
  const parsed = JSON.parse(dumped);
  console.log('  copied payload: ' + dumped.length + ' chars, ' + parsed.log.length + ' log rows');
  ok(parsed.log.length === log.length && parsed.mastery['pl:L:s'].box === 5,
     'copy all data produces the full log and mastery', dumped.slice(0,60));

  a.click('#sback'); await sleep(60);
  // the dashboard now steps back to the panel it was opened from, rather than
  // dropping straight into the game past the settings
  ok(a.screen() === 'parent', 'back from the dashboard returns to the panel',
     'landed on ' + a.screen());
  a.w.close();
}

console.log('\n[9] THE EIGHT FIXES');
{
  const a = boot({ rate:.7, goal:20, lang:'pl', mode:'numbers',
                   prizes:['🍭','🦖','⭐️','🦖'], day:'', restoredV:2 });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2500);

  // 8 — exactly one greeting, and the flag does not add a second
  const greetings = a.said().filter(x => /cześć ada/i.test(x)).length;
  a.clear();
  a.click('.flag[data-lang="pl"]'); await sleep(120);
  const after = a.said().filter(x => /cześć ada/i.test(x)).length;
  ok(greetings === 1 && after === 0, 'one greeting per launch, none on the flag',
     'welcome=' + greetings + ' flag=' + after);

  // 1 — the speed slider must actually reach the utterance
  a.clear();
  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  const r = a.d.getElementById('rate');
  ok(parseFloat(r.min) === 0.3 && parseFloat(r.max) === 1.0, 'speed range widened to 0.3-1.0', r.min + '-' + r.max);
  r.value = '0.4';
  r.dispatchEvent(new a.w.Event('input', { bubbles:true }));
  a.click('#pback'); await sleep(60);
  a.w.__rates = [];
  a.d.getElementById('pic').click(); await sleep(60);
  console.log('  rate for the picture: ' + JSON.stringify(a.w.__rates));
  ok(a.w.__rates.length === 1 && Math.abs(a.w.__rates[0] - 0.4) < 0.001,
     'the slider reaches WORD speech', JSON.stringify(a.w.__rates));

  // 4 — the panel shows which mode and language are live
  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  const onMode = [...a.d.querySelectorAll('[data-mode].on')].map(b => b.dataset.mode);
  const onLang = [...a.d.querySelectorAll('[data-setlang].on')].map(b => b.dataset.setlang);
  ok(onMode.length === 1 && onMode[0] === 'numbers', 'the live practice mode is marked', JSON.stringify(onMode));
  ok(onLang.length === 1 && onLang[0] === 'pl', 'the live language is marked', JSON.stringify(onLang));
  a.click('#pback'); await sleep(60);

  // 7 — a way back to the flags from inside the game
  a.click('#navback'); await sleep(60);
  ok(a.screen() === 'lang', 'the back arrow in the game returns to the flags');
  a.click('.flag[data-lang="nb"]'); await sleep(80);
  ok(a.screen() === 'play', 'and a different language can be chosen');
  a.w.close();
}

{
  // 5 + 6 — a finite album, and tapping a prize shows it big
  const a = boot({ rate:.7, goal:20, lang:'pl', mode:'numbers',
                   prizes:['🍭','🦖','⭐️'], day:'', restoredV:2 });
  await sleep(120);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(80);
  a.click('#trophy'); await sleep(60);

  const earned = a.d.querySelectorAll('#bgrid span').length;
  const slots  = a.d.querySelectorAll('#bgrid .slot').length;
  console.log('  board: ' + earned + ' earned + ' + slots + ' empty = ' + (earned + slots));
  ok(earned + slots === 32, 'the board shows a whole album of 32 slots', earned + '+' + slots);
  ok(/3\/32/.test(a.d.getElementById('btitle').textContent),
     'the title counts the album', a.d.getElementById('btitle').textContent);

  a.d.querySelector('#bgrid span').click(); await sleep(60);
  ok(a.d.getElementById('bigprize').classList.contains('on'), 'tapping a prize shows it big');
  ok(a.screen() === 'board', 'and does not fall through and close the board');
  a.click('#bigprize'); await sleep(60);
  ok(!a.d.getElementById('bigprize').classList.contains('on'), 'tapping the big prize dismisses it');
  a.w.close();
}

{
  // 5 — with 15 of 16 collected, the round must award the one that is missing
  const html = readFileSync(APP, 'utf8');
  const blk = html.slice(html.indexOf('var PRIZES = ['));
  const ALL = blk.slice(0, blk.indexOf(']')).match(/'([^']+)'/g).map(x => x.slice(1, -1));
  const missing = ALL[7];
  const held = ALL.filter(x => x !== missing);

  const a = boot({ rate:.7, goal:1, lang:'pl', mode:'numbers',
                   prizes:held, day:'', restoredV:2 });
  await sleep(150);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(80);
  for (let i = 0; i < 4 && a.screen() === 'play'; i++) {
    const idx = a.btns().indexOf(String(a.count()));
    a.clickBtn(idx < 0 ? 0 : idx); await sleep(1900);
  }
  ok(a.screen() === 'reward', 'round finished', 'on ' + a.screen());
  const now = JSON.parse(a.w.localStorage.getItem('litery.child.v2')).prizes;
  const got = now[now.length - 1];
  console.log('  album had 15/16, awarded: ' + got + '  (missing was ' + missing + ')');
  ok(got === missing, 'PRIZES DO NOT REPEAT INSIDE AN ALBUM', 'got ' + got);
  ok(now.length === 32, 'the album is now complete', 'n=' + now.length);
  a.w.close();
}

console.log('\n[10] THE SLIDER MUST REACH LETTER SPEECH TOO');
{
  const a = boot({ rate:.7, goal:30, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2 });
  await sleep(150);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(100);

  async function ratesAt(speed) {
    a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
    await sleep(1400);
    const r = a.d.getElementById('rate');
    r.value = String(speed);
    r.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    a.click('#pback'); await sleep(60);

    a.w.__rates = [];
    a.d.querySelector('#word .cell.tappable').click();      // a letter tile
    await sleep(60);
    const tile = a.w.__rates.slice();

    a.w.__rates = [];
    a.d.getElementById('pic').click(); await sleep(60);     // the whole word
    const word = a.w.__rates.slice();
    return { tile, word };
  }

  const slow = await ratesAt(0.4);
  const fast = await ratesAt(1.0);
  console.log('  slider 0.4 -> letter ' + slow.tile + ', word ' + slow.word);
  console.log('  slider 1.0 -> letter ' + fast.tile + ', word ' + fast.word);

  ok(slow.tile.length === 1 && fast.tile.length === 1, 'a letter tile speaks once each time');
  ok(fast.tile[0] > slow.tile[0], 'LETTER SPEECH FOLLOWS THE SLIDER',
     slow.tile[0] + ' vs ' + fast.tile[0]);
  ok(slow.tile[0] < slow.word[0] && fast.tile[0] < fast.word[0],
     'and stays slower than a whole word at either end',
     JSON.stringify(slow) + ' / ' + JSON.stringify(fast));
  ok(slow.tile[0] >= 0.3, 'never drops below what iOS will honour', String(slow.tile[0]));
  a.w.close();
}

console.log('\n[11] MIXED MODE BALANCE');
{
  const a = boot({ rate:.7, goal:9, lang:'pl', mode:'mixed', prizes:[], day:'', restoredV:2 });
  await sleep(150);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(100);

  const seq = [];
  for (let i = 0; i < 9 && a.screen() === 'play'; i++) {
    seq.push(a.count() > 0 ? 'N' : 'L');
    const idx = a.count() > 0
      ? a.btns().indexOf(String(a.count()))
      : a.btns().findIndex((_, j) => true);   // letters: try one, retry if wrong
    if (a.count() > 0) { a.clickBtn(idx < 0 ? 0 : idx); }
    else {
      // letter or first-sound question: try the buttons in turn until one is right
      for (let j = 0; j < a.btns().length; j++) {
        a.clickBtn(j); await sleep(500);
        if (a.d.querySelector('#opts .opt.good')) break;
      }
    }
    await sleep(1900);
  }
  console.log('  sequence: ' + seq.join(' '));
  const nums = seq.filter(x => x === 'N').length;
  let run = 0, worst = 0;
  seq.forEach(x => { run = x === 'N' ? run + 1 : 0; worst = Math.max(worst, run); });
  ok(seq.length >= 8, 'nine questions were generated', 'got ' + seq.length);
  ok(worst <= 1, 'NEVER TWO NUMBER QUESTIONS IN A ROW', 'longest run ' + worst);
  ok(nums >= 1 && nums <= 3, 'roughly one question in four is a number', nums + ' of ' + seq.length);
  ok(seq.slice(0,3).join('') === 'LLL', 'a round opens with three letters', seq.slice(0,4).join(''));
  a.w.close();
}

console.log('\n[12] THE LOOP AFTER A ROUND, AND COUNT RANGE');
{
  const a = boot({ rate:.7, goal:2, lang:'pl', mode:'numbers', prizes:[], day:'', restoredV:2 });
  await sleep(150);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(100);

  // stage 1 must never show more than five things to count
  const counts = [];
  for (let i = 0; i < 6 && a.screen() === 'play'; i++) {
    counts.push(a.count());
    const idx = a.btns().indexOf(String(a.count()));
    a.clickBtn(idx < 0 ? 0 : idx); await sleep(1900);
  }
  console.log('  counts shown: ' + JSON.stringify(counts) + '  buttons were digits <= 5');
  ok(counts.every(n => n >= 1 && n <= 5), 'STAGE 1 COUNTS 1-5, NOT 1-10', JSON.stringify(counts));
  ok(a.screen() === 'reward', 'round finished', 'on ' + a.screen());

  // the trap: reward -> board -> back used to land on a dead, answered question
  a.click('#toboard'); await sleep(80);
  ok(a.screen() === 'board', 'the prize board opens from the reward screen');
  a.click('#backx'); await sleep(80);
  console.log('  back from board landed on: ' + a.screen());
  ok(a.screen() === 'reward', 'BACK RETURNS TO THE REWARD SCREEN, NOT A DEAD QUESTION',
     'landed on ' + a.screen());

  // and from there she can still start the next round
  a.click('#again'); await sleep(120);
  ok(a.screen() === 'play', 'play again still works after visiting the board');
  ok(a.btns().length === 2, 'and the new question is answerable', a.btns().join(','));
  a.w.close();
}

{
  // opening the board mid-round must still come back to the game
  const a = boot({ rate:.7, goal:20, lang:'pl', mode:'numbers', prizes:['🍭'], day:'', restoredV:2 });
  await sleep(150);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(100);
  a.click('#trophy'); await sleep(80);
  ok(a.screen() === 'board', 'the board opens mid-round');
  a.click('#backx'); await sleep(80);
  ok(a.screen() === 'play', 'and back returns to the game, not the reward screen');
  ok(a.btns().length === 2, 'with a live question', a.btns().join(','));
  a.w.close();
}

console.log('\n[13] WEIGHTED SELECTION — her real problem');
// a name with none of the pool letters in it: these tests are about how many letters
// are in play, and since 7 Oct the letters of her name jump the queue ([24] tests that)
{
  // exactly the state her synced data showed: Polish S mastered, T and B not
  const mastery = {
    'pl:L:s': { n:12, ft:9, box:5, streak:3, last:Date.now(), ms:[3400] },
    'pl:L:t': { n:6,  ft:4, box:1, streak:0, last:Date.now(), ms:[3600] },
    'pl:L:b': { n:5,  ft:4, box:1, streak:0, last:Date.now(), ms:[3300] }
  };
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'',
                   restoredV:2, __mastery:mastery }, '?dev=probe');
  await sleep(200);
  ok(!!a.w.__probe, 'probe hook available');

  const N = 3000, seen = { s:0, t:0, b:0, m:0, k:0 };
  for (let i = 0; i < N; i++) seen[a.w.__probe.chooseTarget('letter')]++;
  const pct = k => Math.round(100 * seen[k] / N);
  console.log('  over ' + N + ' draws:  S ' + pct('s') + '%   T ' + pct('t') + '%   B ' + pct('b') + '%');

  ok(seen.t > seen.s && seen.b > seen.s,
     'THE TWO SHE DOES NOT KNOW NOW BEAT THE ONE SHE DOES',
     'S=' + seen.s + ' T=' + seen.t + ' B=' + seen.b);
  // design predicts ~27%: the 20% retention draw has only one mastered letter
  // to land on, plus 80% x 1/11 from the weighting. spreads as more are learned.
  // a letter mastered TODAY drops to the floor weight — there is no point
  // re-drilling it in the same session. staleness brings it back later.
  ok(pct('s') >= 2 && pct('s') <= 10,
     'a letter mastered today steps aside for the rest of the session', pct('s') + '%');
  ok(Math.abs(seen.t - seen.b) < N * 0.08, 'the two unknown letters get similar share',
     'T=' + seen.t + ' B=' + seen.b);

  // and it must come back once it has gone stale, or mastery rots unseen
  const stale = Object.assign({}, mastery);
  stale['pl:L:s'] = Object.assign({}, stale['pl:L:s'],
                                  { last: Date.now() - 4 * 86400000 });
  const b2 = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'',
                    restoredV:2, __mastery:stale }, '?dev=probe');
  await sleep(200);
  const seen2 = { s:0, t:0, b:0, m:0, k:0 };
  for (let i = 0; i < N; i++) seen2[b2.w.__probe.chooseTarget('letter')]++;
  const p2 = Math.round(100 * seen2.s / N);
  console.log('  same letters, S untouched for 4 days: S ' + p2 + '%');
  ok(p2 >= 14, 'A STALE MASTERED LETTER COMES BACK', p2 + '%');
  b2.w.close();

  // and the word list must no longer skew the letter
  const words = {};
  for (let i = 0; i < 600; i++) {
    const q = a.w.__probe.nextWord();
    if (q.kind === 'letter') words[q.w.charAt(0)] = (words[q.w.charAt(0)] || 0) + 1;
  }
  console.log('  first letters of 600 generated words: ' + JSON.stringify(words));
  ok((words['s'] || 0) < (words['t'] || 0) + (words['b'] || 0),
     'five S-words no longer drag the letter distribution', JSON.stringify(words));
  a.w.close();
}

{
  // a fresh child, nothing mastered: everything should be roughly even
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2 },
                 '?dev=probe');
  await sleep(200);
  const N = 3000, seen = { s:0, t:0, b:0 };
  for (let i = 0; i < N; i++) seen[a.w.__probe.chooseTarget('letter')]++;
  console.log('  fresh child: S ' + seen.s + '  T ' + seen.t + '  B ' + seen.b);
  ok(seen.s + seen.t + seen.b === N,
     'a child with nothing learned only meets the first three letters',
     JSON.stringify(seen));
  const lo = Math.min(seen.s, seen.t, seen.b), hi = Math.max(seen.s, seen.t, seen.b);
  ok(hi - lo < N * 0.08, 'with nothing learned yet, the three letters are even',
     lo + '..' + hi);
  a.w.close();
}

{
  // with several letters mastered the retention draw must SPREAD, not pile
  // onto one — otherwise a mastered letter keeps a fifth of every session
  const mastery = {
    'nb:L:s': { n:20, ft:18, box:5, streak:5, last:Date.now(), ms:[2500] },
    'nb:L:b': { n:20, ft:18, box:5, streak:5, last:Date.now(), ms:[2500] },
    'nb:L:t': { n:20, ft:17, box:4, streak:3, last:Date.now(), ms:[2500] },
    'nb:L:e': { n:4,  ft:1,  box:1, streak:0, last:Date.now(), ms:[4000] }
  };
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'nb', mode:'letters', prizes:[], day:'',
                   restoredV:2, __mastery:mastery }, '?dev=probe');
  await sleep(200);
  const N = 3000, seen = { s:0, b:0, t:0, e:0 };
  for (let i = 0; i < N; i++) seen[a.w.__probe.chooseTarget('letter')]++;
  const p = k => Math.round(100 * seen[k] / N);
  console.log('  3 mastered + 1 weak:  S ' + p('s') + '%  B ' + p('b') + '%  T ' + p('t') + '%  E ' + p('e') + '%');
  ok(p('e') > p('s') && p('e') > p('b') && p('e') > p('t'),
     'the one weak letter gets the largest share', JSON.stringify(seen));
  ok(p('s') < 25 && p('b') < 25,
     'no single mastered letter hogs a fifth once others are learned',
     'S=' + p('s') + '% B=' + p('b') + '%');
  a.w.close();
}

console.log('\n[13b] NEW LETTERS DO NOT FLOOD IN');
{
  // her real 23 Sep start: Polish S and B owned, T still missed
  const mastery = {
    'pl:L:s': { n:19, ft:15, box:4, streak:3, last:Date.now(), ms:[3200] },
    'pl:L:b': { n:14, ft:13, box:5, streak:9, last:Date.now(), ms:[3400] },
    'pl:L:t': { n:20, ft:10, box:1, streak:0, last:Date.now(), ms:[4400] }
  };
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'',
                   restoredV:2, __mastery:mastery }, '?dev=probe');
  await sleep(200);
  const pool0 = a.w.__probe.activePool('letter');
  console.log('  pool at start: ' + pool0.join(' '));
  ok(pool0.join('') === 'sbtmk', 'two owned + T + two new', pool0.join(' '));
  a.w.close();

  // each new letter answered once, wrongly — exactly what cascaded on 23 Sep
  const met = Object.assign({}, mastery);
  for (const x of ['m', 'k', 'l', 'd', 'n'])
    met['pl:L:' + x] = { n:1, ft:0, box:1, streak:0, last:Date.now(), ms:[6000] };
  const b1 = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'',
                    restoredV:2, __mastery:met }, '?dev=probe');
  await sleep(200);
  const pool1 = b1.w.__probe.activePool('letter');
  console.log('  after meeting five new letters once: ' + pool1.join(' '));
  ok(pool1.join('') === 'sbtmk', 'MEETING A LETTER DOES NOT OPEN THE NEXT SLOT', pool1.join(' '));
  b1.w.close();

  // owning one frees a slot for the next
  const owned = Object.assign({}, met,
    { 'pl:L:t': Object.assign({}, mastery['pl:L:t'], { box:4 }) });
  const b2 = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'',
                    restoredV:2, __mastery:owned }, '?dev=probe');
  await sleep(200);
  const pool2 = b2.w.__probe.activePool('letter');
  console.log('  after T reaches box 4: ' + pool2.join(' '));
  ok(pool2.join('') === 'sbtmkl', 'OWNING A LETTER LETS THE NEXT ONE IN', pool2.join(' '));
  b2.w.close();
}

console.log('\n[14] NAME OFF THE SOURCE');
{
  // a brand new device: no name stored yet
  const a = boot({ name:'', rate:.7, goal:20, lang:'pl', mode:'mixed', prizes:[], day:'', restoredV:2 });
  await sleep(200);
  ok(a.screen() === 'setup', 'a device with no name asks for one first', 'on ' + a.screen());

  a.d.getElementById('nameinput').value = '  Ada  ';
  a.click('#namego'); await sleep(80);
  ok(a.screen() === 'profile', 'entering a name moves on to the profile');
  ok(a.d.getElementById('pname').textContent === 'Ada', 'and it is trimmed and shown',
     JSON.stringify(a.d.getElementById('pname').textContent));
  ok(JSON.parse(a.w.localStorage.getItem('litery.child.v2')).name === 'Ada',
     'the name is stored on the device');

  a.clear();
  a.click('#pick-profile'); await sleep(200);
  console.log('  greeting: ' + JSON.stringify(a.said()));
  ok(a.said().some(x => /cze[sś][cć] ada/i.test(x)), 'the greeting uses it', JSON.stringify(a.said()));
  ok(a.d.getElementById('wtitle').textContent === 'Cześć Ada!', 'and so does the welcome screen',
     a.d.getElementById('wtitle').textContent);
  a.w.close();
}

{
  // an empty name must not be accepted
  const a = boot({ name:'', rate:.7, goal:20, lang:'pl', mode:'mixed', prizes:[], day:'', restoredV:2 });
  await sleep(200);
  a.d.getElementById('nameinput').value = '   ';
  a.click('#namego'); await sleep(60);
  ok(a.screen() === 'setup', 'a blank name is refused', 'on ' + a.screen());
  a.w.close();
}

{
  // nothing that gets published may carry a child's name. checked two ways:
  // the greeting strings must still be placeholders, and the fixture name
  // used by these tests must not appear as a whole word in the app.
  const src = readFileSync(APP, 'utf8');
  const holders = (src.match(/%s/g) || []).length;
  const literal = (src.match(/\bAda\b/g) || []).length;
  console.log('  %s placeholders: ' + holders + ', literal fixture names: ' + literal);
  ok(holders >= 4, 'greetings and titles are placeholders, not a baked-in name', String(holders));
  ok(literal === 0, 'THE PUBLISHED SOURCE CARRIES NO CHILD NAME', String(literal));
  ok(!/Cze[sś][cć]\s+[A-Z]/.test(src), 'no greeting has a name written into it');
}

{
  // a device still holding a legacy key must lose nothing. renaming a key
  // without migrating is how her prize collection was destroyed once.
  const dom = new JSDOM(readFileSync(APP, 'utf8'), {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      try {
        w.localStorage.setItem('litery.legacy.v2', JSON.stringify(
          { name:'Ada', goal:20, rate:.7, lang:'pl', mode:'mixed',
            prizes:['🍭','🦖','⭐️','🦖'], day:'', restoredV:2 }));
        w.localStorage.setItem('litery.legacy.mastery', JSON.stringify(
          { 'pl:L:s': { n:12, ft:9, box:5, streak:3, last:Date.now(), ms:[3400] } }));
        w.localStorage.setItem('litery.legacy.log', JSON.stringify(
          [{ t:Date.now(), l:'pl', k:'L', s:1, x:'s', d:'b', o:2, w:0, ms:2200, h:0, c:0 }]));
      } catch (e) {}
      w.__said = [];
      w.SpeechSynthesisUtterance = function (t) { this.text = t; };
      Object.defineProperty(w, 'speechSynthesis', { configurable:true, value:{
        getVoices: () => ([{ name:'PL', lang:'pl-PL', localService:true }]),
        speak: u => w.__said.push(u.text), cancel: () => {}, onvoiceschanged:null } });
    }
  });
  const w = dom.window;
  await sleep(250);
  const moved = JSON.parse(w.localStorage.getItem('litery.child.v2') || 'null');
  const mast  = JSON.parse(w.localStorage.getItem('litery.child.mastery') || 'null');
  const lg    = JSON.parse(w.localStorage.getItem('litery.child.log') || 'null');
  console.log('  migrated prizes: ' + JSON.stringify(moved && moved.prizes));
  ok(!!moved && moved.name === 'Ada', 'a legacy key is adopted, settings intact');
  ok(!!moved && moved.prizes.length === 4, 'HER PRIZES SURVIVE A KEY RENAME',
     JSON.stringify(moved && moved.prizes));
  ok(!!mast && mast['pl:L:s'].box === 5, 'and her mastery', JSON.stringify(mast));
  ok(!!lg && lg.length === 1, 'and her attempt log', JSON.stringify(lg));
  ok(w.document.getElementById('setup').classList.contains('on') === false,
     'she is not asked for her name again');
  w.close();
}

console.log('\n[15] IMPORT — moving her between origins');
{
  // a blank device, exactly like the published copy was
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'mixed',
                   prizes:[], day:'', restoredV:0 });
  await sleep(200);

  const before = JSON.parse(a.w.localStorage.getItem('litery.child.v2'));
  console.log('  fresh device prizes: ' + JSON.stringify(before.prizes));
  ok((before.prizes || []).length === 0,
     'A FRESH DEVICE INVENTS NO PRIZES', JSON.stringify(before.prizes));

  // the payload a sync or Copy all data produces
  const payload = {
    build: 28,
    settings: { goal: 20, rate: 0.3, lang: 'nb', mode: 'mixed' },
    prizes: ['⭐️','🍭','🦖','🦖','🐙','🌈','🎨'],
    mastery: {
      'pl:L:s': { n:12, ft:9, box:5, streak:3, last:Date.now(), ms:[3400] },
      'pl:L:t': { n:6,  ft:4, box:1, streak:0, last:Date.now(), ms:[3600] }
    },
    log: Array.from({ length: 59 }, (_, i) => (
      { t: Date.now() - i*60000, l:'pl', k:'L', s:1, x:'s', d:'b', o:2, w:i%3?0:1, ms:2200, h:0, c:0 }))
  };

  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  a.click('#statsbtn'); await sleep(80);
  ok(a.screen() === 'stats', 'dashboard opens');

  a.click('#importbtn'); await sleep(40);
  ok(a.d.getElementById('dump').style.display === 'block', 'a paste box appears');
  a.d.getElementById('dump').value = JSON.stringify(payload);
  a.click('#importbtn'); await sleep(80);

  const after = JSON.parse(a.w.localStorage.getItem('litery.child.v2'));
  const mast  = JSON.parse(a.w.localStorage.getItem('litery.child.mastery'));
  const lg    = JSON.parse(a.w.localStorage.getItem('litery.child.log'));
  console.log('  after import: ' + after.prizes.length + ' prizes, ' + lg.length +
              ' rows, ' + Object.keys(mast).length + ' mastery items');
  ok(after.prizes.length === 7, 'ALL SEVEN PRIZES ARRIVE', JSON.stringify(after.prizes));
  ok(lg.length === 59, 'all 59 attempts arrive', String(lg.length));
  ok(mast['pl:L:s'].box === 5, 'mastery boxes arrive intact');
  ok(after.rate === 0.3 && after.lang === 'nb', 'settings come with it',
     after.rate + ' / ' + after.lang);
  ok(after.name === 'Ada', 'the name typed on THIS device is kept', after.name);
  ok(a.screen() === 'stats', 'the dashboard redraws with the imported data');
  ok(a.d.querySelectorAll('#sbody .item').length > 0, 'and it now has rows to show');
  a.w.close();
}

{
  // rubbish in must not wipe anything
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'mixed',
                   prizes:['🌈'], day:'', restoredV:2 });
  await sleep(200);
  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  a.click('#statsbtn'); await sleep(80);
  a.click('#importbtn'); await sleep(40);
  a.d.getElementById('dump').value = 'this is not json';
  a.click('#importbtn'); await sleep(60);
  const kept = JSON.parse(a.w.localStorage.getItem('litery.child.v2'));
  ok(kept.prizes.length === 1 && kept.prizes[0] === '🌈',
     'a bad paste changes nothing', JSON.stringify(kept.prizes));
  ok(/Could not read/.test(a.d.getElementById('importbtn').textContent),
     'and says so', a.d.getElementById('importbtn').textContent);
  a.w.close();
}

console.log('\n[16] OPENING A SCREEN TWICE MUST NOT ACCUMULATE');
{
  // seeded, so the dashboard actually has rows to accumulate
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters',
                   prizes:['🍭','🦖','⭐️'], day:'', restoredV:2,
                   __mastery: {
                     'pl:L:s': { n:12, ft:9, box:5, streak:3, last:Date.now(), ms:[3400] },
                     'pl:L:t': { n:6,  ft:4, box:1, streak:0, last:Date.now(), ms:[3600] },
                     'pl:N:3': { n:4,  ft:3, box:3, streak:1, last:Date.now(), ms:[2100] }
                   },
                   __log: [{ t:Date.now(), l:'pl', k:'L', s:1, x:'s', d:'b', o:2, w:0, ms:2200, h:0, c:0 }] });
  await sleep(200);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(100);

  const counts = [];
  for (let i = 0; i < 4; i++) {
    a.click('#trophy'); await sleep(60);
    counts.push({
      bars:  a.d.querySelectorAll('#board .albumbar').length,
      tiles: a.d.querySelectorAll('#bgrid span').length,
      slots: a.d.querySelectorAll('#bgrid .slot').length
    });
    a.click('#backx'); await sleep(60);
  }
  console.log('  four opens: ' + JSON.stringify(counts));
  ok(counts.every(c => c.bars === 1), 'EXACTLY ONE PROGRESS BAR, HOWEVER OFTEN IT IS OPENED',
     JSON.stringify(counts.map(c => c.bars)));
  ok(counts.every(c => c.tiles === 3 && c.slots === 29),
     'and the album does not grow either', JSON.stringify(counts[3]));

  // same check for the dashboard, which builds its rows the same way
  const st = [];
  for (let i = 0; i < 3; i++) {
    a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
    await sleep(1400);
    a.click('#statsbtn'); await sleep(60);
    st.push(a.d.querySelectorAll('#sbody .shead').length);
    a.click('#sback'); await sleep(60);
  }
  console.log('  dashboard sections over three opens: ' + JSON.stringify(st));
  ok(st[0] > 0, 'the dashboard actually had sections to count', JSON.stringify(st));
  ok(st[0] === st[1] && st[1] === st[2], 'the dashboard does not accumulate rows', JSON.stringify(st));
  a.w.close();
}

console.log('\n[17] MERGING TWO DEVICES');
{
  const day = 86400000, t0 = Date.now() - 3*day;
  // the iPad: long history, prizes, two of them predating prize logging
  const ipadLog = [];
  for (let i = 0; i < 30; i++)
    ipadLog.push({ t:t0 + i*60000, l:'pl', k:'L', s:1, x:(i%2?'s':'t'), d:'b', o:2,
                   w:(i%3===0?1:0), ms:2200, h:0, c:0 });
  ipadLog.push({ t:t0 + 31*60000, l:'pl', k:'P', x:'🌈' });

  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2,
                   prizes:['🍭','🦖','🌈'],          // two predate logging, one logged
                   __log: ipadLog,
                   __mastery: rebuildLike(ipadLog) });
  await sleep(220);
  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  a.click('#statsbtn'); await sleep(80);

  // the phone: a separate short session today, one prize
  const phoneLog = [];
  for (let i = 0; i < 12; i++)
    phoneLog.push({ t:Date.now() - (12-i)*30000, l:'pl', k:'L', s:1, x:'m', d:'k', o:2,
                    w:0, ms:1800, h:0, c:0 });
  phoneLog.push({ t:Date.now() - 1000, l:'pl', k:'P', x:'🐙' });
  const phone = { build:34, settings:{goal:20,rate:.7,lang:'pl',mode:'letters'},
                  prizes:['🐙'], mastery:{}, log:phoneLog };

  a.click('#mergebtn'); await sleep(40);
  a.d.getElementById('dump').value = JSON.stringify(phone);
  a.click('#mergebtn'); await sleep(120);

  const saved = JSON.parse(a.w.localStorage.getItem('litery.child.v2'));
  const lg    = JSON.parse(a.w.localStorage.getItem('litery.child.log'));
  const mast  = JSON.parse(a.w.localStorage.getItem('litery.child.mastery'));
  console.log('  ' + a.d.getElementById('mergebtn').textContent);
  console.log('  prizes now: ' + JSON.stringify(saved.prizes));

  ok(lg.length === 31 + 13, 'both histories are present', 'rows=' + lg.length);
  ok(saved.prizes.length === 4 &&
     saved.prizes[0] === '🍭' && saved.prizes[1] === '🦖' &&
     saved.prizes[2] === '🌈' && saved.prizes[3] === '🐙',
     'PRIZES COMBINE WITHOUT LOSING THE UNLOGGED ONES', JSON.stringify(saved.prizes));
  ok(!!mast['pl:L:m'], 'the letter only the phone saw is now known', Object.keys(mast).join(','));
  ok(!!mast['pl:L:s'] && !!mast['pl:L:t'], 'and the iPad letters survive');
  ok(mast['pl:L:m'].n === 12 && mast['pl:L:m'].box === 5,
     'mastery is replayed from the merged log, not averaged',
     JSON.stringify(mast['pl:L:m']));

  // merging the same payload twice must be a no-op
  a.click('#mergebtn'); await sleep(40);
  a.d.getElementById('dump').value = JSON.stringify(phone);
  a.click('#mergebtn'); await sleep(120);
  const again = JSON.parse(a.w.localStorage.getItem('litery.child.log'));
  const p2 = JSON.parse(a.w.localStorage.getItem('litery.child.v2')).prizes;
  console.log('  after merging the same payload twice: ' + again.length + ' rows, ' + p2.length + ' prizes');
  ok(again.length === lg.length, 'MERGING TWICE ADDS NOTHING', again.length + ' vs ' + lg.length);
  ok(p2.length === 4, 'and does not duplicate the prize', JSON.stringify(p2));
  a.w.close();
}

console.log('\n[18] THE TWO BUGS FROM TODAY');
{
  // switching language at 19 of 20 used to hand her a prize on question one
  const a = boot({ name:'Ada', rate:.7, goal:3, lang:'pl', mode:'letters',
                   prizes:[], day:'', restoredV:2 });
  await sleep(200);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(100);

  // get her to 2 of 3 in Polish
  let done = 0;
  for (let i = 0; i < 8 && done < 2 && a.screen() === 'play'; i++) {
    const before = a.d.querySelectorAll('#stars .st.f').length;
    a.clickBtn(i % 2); await sleep(700);
    const after = a.d.querySelectorAll('#stars .st.f').length;
    if (after > before) done = after;
    await sleep(1300);
  }
  console.log('  Polish round at ' + done + ' of 3');
  ok(done === 2, 'reached 2 of 3 in Polish', String(done));

  a.click('#navback'); await sleep(60);
  a.click('.flag[data-lang="nb"]'); await sleep(150);
  const carried = a.d.querySelectorAll('#stars .st.f').length;
  console.log('  stars after switching to Norwegian: ' + carried);
  ok(carried === 0, 'NORWEGIAN STARTS ITS OWN ROUND, NOT AT 2 OF 3', String(carried));

  // and Polish still has its two when she goes back
  a.click('#navback'); await sleep(60);
  a.click('.flag[data-lang="pl"]'); await sleep(150);
  const back = a.d.querySelectorAll('#stars .st.f').length;
  console.log('  stars back in Polish: ' + back);
  ok(back === 2, 'and the Polish round is still where she left it', String(back));
  a.w.close();
}

{
  // the album must be bounded by unique prizes, and big enough to last
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2, prizes:['⭐️','🍭','🦖','🦖','🐙','🌈','🎨','🎁'] });
  await sleep(220);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(100);
  a.click('#trophy'); await sleep(80);

  const tiles = a.d.querySelectorAll('#bgrid span').length;
  const slots = a.d.querySelectorAll('#bgrid .slot').length;
  const title = a.d.getElementById('btitle').textContent;
  console.log('  ' + title.trim() + '  (' + tiles + ' earned + ' + slots + ' empty)');
  ok(tiles + slots === 32, 'an album is 32 prizes, not 16', tiles + '+' + slots);
  // a duplicate no longer restarts the album — it is skipped, so all seven
  // distinct prizes stay on the board
  ok(tiles === 7, 'a duplicate is skipped rather than closing the album', String(tiles));
  ok(/7\/32/.test(title), 'and the title counts the distinct ones', title);
  a.w.close();
}

console.log('\n[19] CLOUD SYNC');
{
  // a fake server that behaves like the Worker: merge and hand back
  let serverLog = [], calls = 0, lastBody = null;
  const fakeFetch = (url, opts) => {
    calls++;
    lastBody = JSON.parse(opts.body);
    const seen = new Set(), merged = [];
    for (const r of [...serverLog, ...(lastBody.log || [])]) {
      const k = r.t + '|' + r.k + '|' + (r.x === undefined ? '' : r.x);
      if (seen.has(k)) continue; seen.add(k); merged.push(r);
    }
    merged.sort((a, b) => a.t - b.t);
    const added = merged.length - serverLog.length;
    serverLog = merged;
    return Promise.resolve({ json: () => Promise.resolve({
      log: merged, mastery: {}, prizes: ['⭐️','🍭'], added }) });
  };

  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2, syncKey:'k'.repeat(32), prizes:[],
                   __log:[{ t:1000, l:'pl', k:'L', s:1, x:'s', d:'b', o:2, w:0, ms:2000, h:0, c:0 }] });
  a.w.fetch = fakeFetch;
  await sleep(200);
  a.click('#pick-profile'); await sleep(2500);

  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  ok(a.d.getElementById('synckey').value === 'k'.repeat(32),
     'the saved key shows in the panel', a.d.getElementById('synckey').value.slice(0,8));

  calls = 0;
  a.click('#syncnow'); await sleep(200);
  ok(calls === 1, 'Sync now posts once', String(calls));
  ok(lastBody && Array.isArray(lastBody.log) && lastBody.log.length === 1,
     'and sends this device\'s whole history', JSON.stringify(lastBody && lastBody.log && lastBody.log.length));
  ok(JSON.parse(a.w.localStorage.getItem('litery.child.v2')).prizes.length === 2,
     'the merged reply is adopted locally',
     JSON.stringify(JSON.parse(a.w.localStorage.getItem('litery.child.v2')).prizes));
  console.log('  status line: ' + a.d.getElementById('syncstat').textContent);

  // a second device with its own row must converge, not overwrite
  const b = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2, syncKey:'k'.repeat(32), prizes:[],
                   __log:[{ t:2000, l:'pl', k:'L', s:1, x:'m', d:'k', o:2, w:0, ms:1800, h:0, c:0 }] });
  b.w.fetch = fakeFetch;
  await sleep(200);
  b.click('#pick-profile'); await sleep(2500);
  b.d.getElementById('gear').dispatchEvent(new b.w.MouseEvent('mousedown'));
  await sleep(1400);
  b.click('#syncnow'); await sleep(200);
  const bLog = JSON.parse(b.w.localStorage.getItem('litery.child.log'));
  console.log('  second device after sync: ' + bLog.length + ' rows');
  ok(bLog.length === 2, 'THE SECOND DEVICE ENDS UP WITH BOTH HISTORIES', String(bLog.length));
  b.w.close();

  // and a device in test-run mode must never touch the server
  calls = 0;
  a.click('#practicebtn'); await sleep(40);
  a.click('#syncnow'); await sleep(150);
  ok(calls === 0, 'a parent test run never syncs', String(calls));
  a.w.close();
}

console.log('\n[20] THE GEAR IS REACHABLE FROM EVERYWHERE');
{
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2, prizes:['🍭','🦖'] });
  await sleep(220);
  const visible = () => a.d.getElementById('gear').style.display !== 'none';
  const seen = {};

  seen.profile = visible();
  a.click('#pick-profile'); await sleep(200);
  seen.welcome = visible();
  await sleep(2300);
  seen.lang = visible();
  a.click('.flag[data-lang="pl"]'); await sleep(120);
  seen.play = visible();
  a.click('#trophy'); await sleep(80);
  seen.board = visible();
  a.click('#backx'); await sleep(80);

  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  seen.parent = visible();
  ok(a.screen() === 'parent', 'long press still opens the panel from the game');
  a.click('#statsbtn'); await sleep(80);
  seen.stats = visible();
  ok(a.screen() === 'stats', 'and stats is the first button in the panel');

  console.log('  gear visible on: ' + JSON.stringify(seen));
  ok(seen.profile && seen.welcome && seen.lang && seen.play && seen.board,
     'THE GEAR IS ON EVERY SCREEN SHE PLAYS THROUGH', JSON.stringify(seen));
  ok(!seen.parent && !seen.stats, 'and hidden on the panels themselves', JSON.stringify(seen));
  a.w.close();
}

{
  // it must also work as an entry point from a screen that is not the game
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2, prizes:[] });
  await sleep(220);
  ok(a.screen() === 'profile', 'starting on the profile screen');
  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  ok(a.screen() === 'parent', 'THE PANEL OPENS WITHOUT STARTING A GAME FIRST',
     'landed on ' + a.screen());
  a.click('#pback'); await sleep(80);
  ok(a.screen() === 'profile',
     'AND BACK RETURNS WHERE IT WAS OPENED FROM, NOT AN EMPTY GAME',
     'landed on ' + a.screen());

  // opened during a game, back must land on a question she can answer
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(120);
  a.d.getElementById('gear').dispatchEvent(new a.w.MouseEvent('mousedown'));
  await sleep(1400);
  a.click('#pback'); await sleep(100);
  ok(a.screen() === 'play' && a.d.querySelectorAll('#opts .opt').length === 2,
     'and from a game it returns to a live question',
     a.screen() + '/' + a.d.querySelectorAll('#opts .opt').length);
  a.w.close();
}

console.log('\n[21] ALBUMS END WHEN FULL, NOT ON A REPEAT');
{
  // her real list: 15 awarded, four of them duplicates from the unsynced days
  const hers = ['⭐️','🍭','🦖','🦖','🐙','🌈','🎨','🎁','🎁','🦜','🐬','🎨','🐝','🌈','🍓'];
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2, prizes:hers });
  await sleep(220);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(120);
  a.click('#trophy'); await sleep(80);

  const tiles = a.d.querySelectorAll('#bgrid span').length;
  const slots = a.d.querySelectorAll('#bgrid .slot').length;
  const title = a.d.getElementById('btitle').textContent.trim();
  console.log('  board: ' + title + '   (' + tiles + ' earned + ' + slots + ' empty)');
  ok(tiles === 11, 'ALL ELEVEN DISTINCT PRIZES ARE ON THE BOARD', String(tiles));
  ok(tiles + slots === 32, 'and the album is still 32 slots', tiles + '+' + slots);
  ok(/11\/32/.test(title), 'the title counts the distinct ones', title);
  ok(!/\s2\s|\s3\s/.test(title), 'and shows no album number', JSON.stringify(title));

  // the stored record is not rewritten — it still says what was awarded
  const saved = JSON.parse(a.w.localStorage.getItem('litery.child.v2'));
  ok(saved.prizes.length === 15, 'the stored history keeps all fifteen awards',
     String(saved.prizes.length));
  a.w.close();
}

{
  // a genuinely completed album must still roll over
  const full = [];
  const src = ['⭐️','🌈','🚀','🦋','🐬','🍓','🎠','🌻','🐙','🎨','🦖','🍭','🐝','🌙','🦜','🎁',
               '🦄','🐧','🦩','🐳','🍉','🍕','🎈','🏰','🚂','🪁','🐞','🌺','🦊','🐨','🧁','🎩'];
  src.forEach(x => full.push(x));
  full.push('⭐️', '🌈');          // first two of the next album
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2, prizes:full });
  await sleep(220);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(120);
  a.click('#trophy'); await sleep(80);
  const tiles = a.d.querySelectorAll('#bgrid span').length;
  const title = a.d.getElementById('btitle').textContent.trim();
  console.log('  after a full set: ' + title + '  (' + tiles + ' earned)');
  ok(tiles === 2, 'a completed album rolls over to a fresh one', String(tiles));
  ok(/2/.test(title), 'and the second album is numbered', title);
  a.w.close();
}

console.log('\n[22] THE TOP BAR ON A PHONE');
{
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', day:'',
                   restoredV:2, prizes:['⭐️','🍭','🦖','🦖','🐙','🌈','🎨','🎁','🎁',
                                        '🦜','🐬','🎨','🐝','🌈','🍓'] });
  await sleep(220);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(120);

  const dots = a.d.querySelectorAll('#stars .st').length;
  console.log('  dots drawn: ' + dots + ' for a goal of 20');
  ok(dots === 20, 'ALL TWENTY DOTS EXIST, WHATEVER THE WIDTH', String(dots));
  ok(!/width:/.test(a.d.querySelector('#stars .st').getAttribute('style') || ''),
     'and none of them is pinned to a fixed pixel size',
     a.d.querySelector('#stars .st').getAttribute('style') || '(no inline style)');

  // the back arrow must not borrow the settings gear's fixed position
  const nav = a.d.getElementById('navback');
  ok(!nav.classList.contains('gear'),
     'the back arrow is not a .gear, so it stays in the bar', nav.className);
  ok(nav.parentElement.classList.contains('top'), 'and sits inside the top bar');
  ok(a.d.getElementById('gear').parentElement === a.d.body,
     'while the settings gear is a top-level fixed control');

  // the trophy must count the album, matching the board
  const count = a.d.getElementById('tcount').textContent;
  a.click('#trophy'); await sleep(80);
  const title = a.d.getElementById('btitle').textContent;
  console.log('  trophy reads ' + count + ', board reads ' + title.trim());
  ok(count === '11', 'THE TROPHY COUNTS THE ALBUM, NOT EVERY AWARD EVER', count);
  ok(title.indexOf(count + '/32') >= 0, 'so the two agree', count + ' vs ' + title.trim());
  a.w.close();
}

console.log('\n[23] A MISSED LETTER COMES BACK');
{
  // her data on 27 Sep: Polish K right 61% of 28 tries with two buttons, so a
  // guess cost nothing — the second tap still earned the star
  const a = boot({ name:'Ada', rate:.7, goal:30, lang:'pl', mode:'letters', day:'',
                   restoredV:2, prizes:[] }, '?dev=probe');
  await sleep(220);
  a.click('#pick-profile'); await sleep(2500);
  a.click('.flag[data-lang="pl"]'); await sleep(120);

  const btnFor = right => [...a.d.querySelectorAll('#opts .opt')]
    .findIndex(b => (a.w.__probe.S.word.kind === 'first' ? b.textContent === a.w.__probe.S.word.e
                     : b.textContent.toLowerCase() === a.w.__probe.S.answer) === right);
  const lastRow = () => { const l = JSON.parse(a.w.localStorage.getItem('litery.child.log') || '[]');
                          return l[l.length - 1]; };
  async function miss() {
    const t = a.w.__probe.S.answer, w = a.w.__probe.S.word.w;
    await sleep(300);                  // a first tap that is measurably later than the start
    a.clickBtn(btnFor(false)); await sleep(600);
    a.clear();
    a.clickBtn(btnFor(true)); await sleep(500);
    const said = a.said();
    await sleep(1400);
    return { t, w, said, row: lastRow() };
  }
  async function hit() {
    const t = a.w.__probe.S.answer;
    a.clickBtn(btnFor(true)); await sleep(1900);
    return { t, row: lastRow() };
  }

  const m1 = await miss();
  console.log('  missed ' + m1.t + ' (' + m1.w + '), then heard ' + JSON.stringify(m1.said));
  ok(m1.said.some(x => x === m1.t + ' jak ' + m1.w),
     'AFTER A MISS THE RIGHT TAP SAYS "<letter> jak <this word>"', JSON.stringify(m1.said));
  ok(typeof m1.row.f === 'number' && m1.row.f >= 250 && m1.row.f < m1.row.ms,
     'the row keeps the time to her FIRST tap, before the time to the right one',
     'f=' + m1.row.f + ' ms=' + m1.row.ms);

  const q2 = await hit();
  ok(!q2.row.b, 'the question in between is an ordinary one', JSON.stringify(q2.row));
  const back = a.w.__probe.S.answer;
  console.log('  question after that asks: ' + back + ' (missed was ' + m1.t + ')');
  ok(back === m1.t, 'THE MISSED LETTER IS ASKED AGAIN TWO QUESTIONS LATER', back + ' vs ' + m1.t);

  // she misses it again, and again: it may return twice in a round, not forever
  const m2 = await miss();
  ok(m2.row.b === 1, 'the returned question is marked in the log', JSON.stringify(m2.row));
  await hit();
  ok(a.w.__probe.S.answer === m1.t, 'missed on its return, it comes back once more', a.w.__probe.S.answer);
  await miss();
  const pending = a.w.__probe.S.due.filter(d => d.t === m1.t).length;
  ok(pending === 0, 'AFTER TWO RETURNS IN A ROUND IT STOPS CHASING HER', JSON.stringify(a.w.__probe.S.due));

  // a right first try on a returned letter clears it
  a.w.__probe.S.due = []; a.w.__probe.S.back = {};
  const m3 = await miss(); await hit();
  ok(a.w.__probe.S.answer === m3.t, 'a fresh miss returns as before', a.w.__probe.S.answer + ' vs ' + m3.t);
  const h = await hit();
  ok(h.row.b === 1 && h.row.w === 0 && a.w.__probe.S.due.length === 0,
     'got right on its return, nothing is left waiting', JSON.stringify(a.w.__probe.S.due));
  a.w.close();
}
{
  // a number slot does not eat the return — it waits for the next letter
  const a = boot({ rate:.7, goal:20, lang:'pl', mode:'mixed', prizes:[], day:'', restoredV:2 },
                 '?dev=probe');
  await sleep(200);
  a.w.__probe.S.correct = 3;                       // 3 % 4 === 3: this slot is a number
  a.w.__probe.S.due = [{ lang:'pl', t:'b', left:0 }];
  const n = a.w.__probe.nextWord();
  ok(n.kind === 'number' && a.w.__probe.S.due.length === 1, 'a number slot leaves the return waiting',
     JSON.stringify(n) + ' ' + JSON.stringify(a.w.__probe.S.due));
  a.w.__probe.S.correct = 4;
  const l = a.w.__probe.nextWord();
  ok(l.kind === 'letter' && l.w.charAt(0).toLowerCase() === 'b' && l.back,
     'and the next letter slot asks it', JSON.stringify(l));
  a.w.__probe.S.lang = 'nb'; a.w.__probe.S.due = [{ lang:'pl', t:'b', left:0 }];
  ok(!a.w.__probe.nextWord().back, 'a Polish return never fires inside a Norwegian round');
  a.w.close();
}

console.log('\n[AUDIT 2026-09-30] ROUND COUNTER, SYNC AND PAUSE FIXES');
const saved = a => { const o = {}; for (let i = 0; i < a.w.localStorage.length; i++) {
  const k = a.w.localStorage.key(i); o[k] = a.w.localStorage.getItem(k); } return o; };
const bootFrom = (store, pre) => boot({}, '?dev=probe', w => {
  w.localStorage.clear(); for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  if (pre) pre(w); });
const tapRight = async (a, wait = 1800) => {
  /* a first-sound round answers with a picture: the right one is S.word.e */
  const S = a.w.__probe.S, want = S.word.kind === 'number' ? S.answer : S.word.kind === 'first' ? S.word.e : S.answer.toUpperCase();
  [...a.d.querySelectorAll('#opts .opt')].find(b => b.textContent === want).click();
  await sleep(wait);
};
{
  // a finished round, then the app is reloaded the same day
  const a = boot({ goal:5, lang:'pl', mode:'letters', prizes:[] }, '?dev=probe');
  await sleep(150);
  a.click('.flag[data-lang="pl"]'); await sleep(50);
  for (let i = 0; i < 5; i++) await tapRight(a);
  ok(a.screen() === 'reward', 'five right answers finish a round of five');
  ok(JSON.parse(a.w.localStorage.getItem(KEY)).correct === 0,
     'THE FINISHED ROUND IS SAVED AS 0, NOT AS THE GOAL');
  const b = bootFrom(saved(a)); await sleep(150);
  b.click('.flag[data-lang="pl"]'); await sleep(50);
  ok(b.d.querySelectorAll('#stars .st.f').length === 0, 'after a reload the stars start empty');
  await tapRight(b);
  ok(b.screen() === 'play', 'A RELOAD DOES NOT GIVE A PRIZE FOR ONE ANSWER', b.screen());
  a.w.close(); b.w.close();
}
{
  // a device primed by an older build: a finished round stored in roundBy
  const c = boot({ goal:5, lang:'nb', mode:'letters', prizes:[], roundBy:{ pl:5 } }, '?dev=probe');
  await sleep(150);
  c.click('.flag[data-lang="pl"]'); await sleep(50);
  ok(c.w.__probe.S.correct === 0, 'a stored count at the goal is not restored as progress',
     String(c.w.__probe.S.correct));
  c.w.close();
}
{
  // test run: its own counter, reaches the prize screen, touches nothing
  const a = boot({ goal:5, lang:'pl', mode:'mixed', prizes:[], day:'' }, '?dev=probe');
  await sleep(150);
  a.click('.flag[data-lang="pl"]'); await sleep(50);
  await tapRight(a);                                     // one real answer first
  a.w.__probe.S.practice = true; a.w.__probe.S.practiceN = 0;
  const kinds = [];
  for (let i = 0; i < 5; i++) {
    kinds.push(a.w.__probe.S.word.kind[0]);
    if (i === 2) ok(a.d.querySelectorAll('#stars .st.f').length === 2, 'the test run fills its own stars');
    await tapRight(a);
  }
  ok(a.screen() === 'reward', 'A TEST RUN REACHES THE PRIZE SCREEN', a.screen());
  ok(kinds.includes('n'), 'a mixed test run still asks numbers', kinds.join(''));
  const st = JSON.parse(a.w.localStorage.getItem(KEY));
  ok(st.correct === 1 && st.prizes.length === 0, 'and leaves her round and her prizes alone',
     JSON.stringify({ correct: st.correct, prizes: st.prizes }));
  a.w.close();
}
{
  // the board opened during the pause after the last answer of a round
  const a = boot({ goal:5, lang:'pl', mode:'letters', prizes:[], day:'' }, '?dev=probe');
  await sleep(150);
  a.click('.flag[data-lang="pl"]'); await sleep(50);
  a.w.__probe.S.correct = 4;
  await tapRight(a, 500);
  a.click('#trophy'); await sleep(1500);
  ok(a.screen() === 'board', 'THE BOARD STAYS OPEN THROUGH THE PAUSE', a.screen());
  a.click('#backx'); await sleep(50);
  ok(a.screen() === 'reward', 'leaving it finishes the round she completed', a.screen());
  a.w.close();
}
{
  // in and out of the board faster than the pause: no question is skipped
  const a = boot({ goal:20, lang:'pl', mode:'letters', prizes:[], day:'' }, '?dev=probe');
  await sleep(150);
  a.click('.flag[data-lang="pl"]'); await sleep(50);
  await tapRight(a, 300);
  a.click('#trophy'); await sleep(50); a.click('#backx'); await sleep(50);
  const q = a.w.__probe.S.word;
  await sleep(1600);
  ok(a.w.__probe.S.word === q && !a.w.__probe.S.locked,
     'the late timer does not replace the question she is looking at');
  a.w.close();
}
{
  // answers given while a cloud sync is in flight survive the reply
  let release;
  const a = boot({ goal:20, lang:'pl', mode:'letters', prizes:['⭐️'], day:'',
                   syncKey:'x'.repeat(32) }, '?dev=probe', w => {
    w.fetch = (url, opt) => new Promise(res => {
      const sent = JSON.parse(opt.body);
      release = () => res({ json: async () => ({ log: sent.log.slice(), mastery:{},
                                                 prizes: sent.prizes, added: 0 }) });
    });
  });
  await sleep(150);
  a.click('.flag[data-lang="pl"]'); await sleep(50);
  await sleep(1900);                                   // the launch sync is now in flight
  await tapRight(a); await tapRight(a);
  release(); await sleep(100);
  const lg = JSON.parse(a.w.localStorage.getItem('litery.child.log'));
  const mast = JSON.parse(a.w.localStorage.getItem('litery.child.mastery'));
  ok(lg.length === 2, 'ANSWERS GIVEN DURING A SYNC ARE KEPT', lg.length + ' rows');
  ok(Object.values(mast).reduce((n, m) => n + m.n, 0) === 2, 'and still count in what she knows');
  ok(JSON.parse(a.w.localStorage.getItem(KEY)).prizes.length === 1, 'prizes come back as the server sent them');
  a.w.close();
}
{
  // the phone keeps its whole log: 2500 rows survive a save
  const many = Array.from({ length: 2500 }, (_, i) => ({ t: 1e12 + i, l:'pl', k:'L', x:'s', w:0, ms:900 }));
  const a = boot({ goal:20, lang:'pl', mode:'letters', prizes:[], __log: many }, '?dev=probe');
  await sleep(150);
  a.click('.flag[data-lang="pl"]'); await sleep(50);
  await tapRight(a);
  ok(JSON.parse(a.w.localStorage.getItem('litery.child.log')).length === 2501,
     'THE LOG IS NOT TRIMMED AT 2000 ROWS');
  a.w.close();
}
{
  // the server: a device holding a trimmed log cannot grow the prize list
  const src = readFileSync(new URL('../sync/src/worker.js', import.meta.url), 'utf8');
  const worker = (await import('data:text/javascript,' + encodeURIComponent(src))).default;
  const kv = new Map(), env = { LITERY: { get: async k => kv.has(k) ? JSON.parse(kv.get(k)) : null,
                                           put: async (k, v) => kv.set(k, v) } };
  const post = async body => (await worker.fetch(new Request('https://x/s/' + 'k'.repeat(32),
                               { method:'POST', body: JSON.stringify(body) }), env)).json();
  let log = [], prizes = ['a','b','c','d'], t = 1;
  for (let round = 0; round < 130; round++) {
    for (let i = 0; i < 20; i++) log.push({ t: t++, l:'pl', k:'L', x:'s', w:0, ms:1000 });
    log.push({ t: t++, l:'pl', k:'P', x:'p' + round }); prizes.push('p' + round);
    const d = await post({ prizes, log });
    log = d.log.slice(-2000); prizes = d.prizes;       // a client trimming the way b46 did
  }
  ok(prizes.length === 134, 'A TRIMMED CLIENT LOG NO LONGER INFLATES PRIZES', prizes.length + ' of 134');
  const fresh = await (await worker.fetch(new Request('https://x/s/' + 'q'.repeat(32),
                  { method:'POST', body: JSON.stringify({ prizes:['a','b'], log:[] }) }), env)).json();
  ok(fresh.prizes.length === 2, 'a first post still sets the pre-logging prizes');
}

console.log('\n[24] THE RESEARCH CHANGES (7 Oct)');
{
  // three buttons once a letter has been seen twice; two for its first showings; numbers keep two
  const mastery = {
    'pl:L:s': { n:9, ft:5, box:2, streak:0, last:Date.now(), ms:[3000] },
    'pl:L:b': { n:9, ft:8, box:5, streak:4, last:Date.now(), ms:[2000] },
    'pl:L:t': { n:1, ft:0, box:1, streak:0, last:Date.now(), ms:[5000] }
  };
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2, __mastery:mastery }, '?dev=probe');
  await sleep(150);
  a.click('.flag[data-lang="pl"]'); await sleep(80);
  a.w.__probe.setWord({ kind:'letter', w:'sowa', e:'🦉' });
  const b3 = a.btns();
  ok(b3.length === 3 && new Set(b3).size === 3 && b3.includes('S'), 'A LETTER SHE HAS MET ASKS WITH THREE BUTTONS, all different', b3.join(' '));
  ok(b3.every(x => ['S', 'B', 'T', 'M', 'K'].includes(x)), 'and the other two are letters she has met or is meeting now', b3.join(' '));
  a.w.__probe.setWord({ kind:'letter', w:'tort', e:'🎂' });
  ok(a.btns().length === 2, 'a letter shown only once before still has two', a.btns().join(' '));
  a.w.__probe.setWord({ kind:'number', n:3, e:'🍎' });
  ok(a.btns().length === 2, 'numbers keep two', a.btns().join(' '));
  a.w.__probe.setWord({ kind:'letter', w:'sowa', e:'🦉' });
  const right = a.btns().indexOf('S');
  a.clickBtn(right); await sleep(200);
  const row = JSON.parse(a.w.localStorage.getItem('litery.child.log')).pop();
  ok(row.o === 3 && row.d.split(',').length === 2, 'the log records three options and both distractors', JSON.stringify(row));
  a.w.close();
}
{
  // first-sound rounds: question 3 of every 5 in letters mode
  const mastery = {
    'pl:L:s': { n:9, ft:8, box:5, streak:4, last:Date.now(), ms:[2000] },
    'pl:L:k': { n:9, ft:8, box:5, streak:4, last:Date.now(), ms:[2000] },
    'pl:L:m': { n:9, ft:8, box:5, streak:4, last:Date.now(), ms:[2000] }
  };
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2, __mastery:mastery }, '?dev=probe');
  await sleep(150);
  const P = a.w.__probe;
  P.S.correct = 2;
  const q = P.nextWord();
  ok(q.kind === 'first', 'THE THIRD QUESTION OF FIVE IS A FIRST-SOUND ROUND', JSON.stringify(q).slice(0, 120));
  const starts = q.options.map(o => o.w.charAt(0));
  ok(q.options.length === 3 && starts.filter(c => c === q.t).length === 1 && new Set(starts).size === 3,
     'three pictures, exactly one starting with the letter', JSON.stringify(q.options));
  if (q.variant === 'a') ok(q.cue.w.charAt(0) === q.t && q.cue.w !== q.w, 'the cue picture starts the same way but is a different word', q.cue.w + ' / ' + q.w);
  P.S.correct = 3; const n3 = P.nextWord();
  ok(n3.kind === 'letter', 'the questions either side are letters', n3.kind);
  // both variants come up
  const seen = new Set();
  for (let i = 0; i < 12; i++) { P.S.correct = 2; const x = P.nextWord(); if (x.kind === 'first') seen.add(x.variant); }
  ok(seen.has('a') && seen.has('b'), 'both kinds alternate: picture-to-picture and letter-to-picture', [...seen].join(','));
  // on screen, answered: wrong says the tapped word, right says the pair; the row is F and no box moves
  a.click('.flag[data-lang="pl"]'); await sleep(80);
  P.S.correct = 2; P.S.fsN = 0;
  let w = P.nextWord(); while (w.kind !== 'first') { P.S.correct = 2; w = P.nextWord(); }
  P.setWord(w);
  ok(a.d.querySelectorAll('#opts .opt.picopt').length === 3 && a.tiles().length === 0, 'it shows three picture buttons and no letter tiles');
  ok(w.variant === 'a' ? a.d.getElementById('pic').textContent === w.cue.e : a.d.getElementById('pic').textContent === w.t.toUpperCase(),
     'the top shows the cue picture, or the big letter', a.d.getElementById('pic').textContent);
  const before = JSON.stringify(P.S.correct), mBefore = a.w.localStorage.getItem('litery.child.mastery');
  const btns = [...a.d.querySelectorAll('#opts .opt')];
  const wrongI = w.options.findIndex(o => o.w !== w.w), rightI = w.options.findIndex(o => o.w === w.w);
  a.clear(); btns[wrongI].click(); await sleep(500);
  ok(a.said().includes(w.options[wrongI].w), 'a wrong picture says its own word', JSON.stringify(a.said()));
  a.clear(); btns[rightI].click(); await sleep(500);
  const pair = w.variant === 'a' ? w.w + ', ' + w.cue.w : w.t + ' jak ' + w.w;
  ok(a.said().includes(pair), 'the right one says the two side by side: "' + pair + '"', JSON.stringify(a.said()));
  const frow = JSON.parse(a.w.localStorage.getItem('litery.child.log')).pop();
  ok(frow.k === 'F' && frow.x === w.t && frow.w === 1 && frow.v === w.variant, 'logged as a first-sound row with its letter and kind', JSON.stringify(frow));
  ok(a.w.localStorage.getItem('litery.child.mastery') === mBefore, 'and no Leitner box moves for it');
  ok(P.S.correct === +before + 1, 'it counts towards the round, like any right answer');
  a.w.close();
}
{
  // a missed letter due back now is not displaced by a first-sound round
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2 }, '?dev=probe');
  await sleep(150);
  a.w.__probe.S.correct = 2;
  a.w.__probe.S.due = [{ lang:'pl', t:'b', left:1 }];
  const q = a.w.__probe.nextWord();
  ok(q.kind === 'letter' && q.w.charAt(0) === 'b', 'A MISSED LETTER DUE BACK KEEPS ITS SLOT', JSON.stringify(q));
  a.w.close();
}
{
  // her real 7 Oct problem: S stuck for 46 tries in box 2 held a slot while O A R P W waited
  const now = Date.now(), day = 86400000, log = [];
  for (let i = 0; i < 20; i++) log.push({ t: now - 2 * day + i * 1000, l:'pl', k:'L', x:'s', w: i % 3 === 2 ? 1 : 0, ms:3000 });
  // the pattern continues across days: never three right in a row, so never box 4
  for (let i = 20; i < 25; i++) log.push({ t: now - 3600000 + i * 1000, l:'pl', k:'L', x:'s', w: i % 3 === 2 ? 1 : 0, ms:3000 });
  for (const [x, t0] of [['t', 9], ['k', 10]]) log.push({ t: now - day + t0, l:'pl', k:'L', x, w:1, ms:4000 });
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2, __log:log,
                   __mastery: { 'pl:L:s': { n:25, ft:17, box:2, streak:1, last:now - 3600000, ms:[3000] },
                                'pl:L:t': { n:1, ft:0, box:1, streak:0, last:now - day, ms:[4000] },
                                'pl:L:k': { n:1, ft:0, box:1, streak:0, last:now - day, ms:[4000] } } }, '?dev=probe');
  await sleep(150);
  ok(a.w.__probe.isResting('s'), 'A LETTER WHOSE LAST 15 TRIES NEVER REACHED BOX 4 RESTS AFTER 5 TRIES TODAY');
  const pool = a.w.__probe.activePool('letter');
  ok(!pool.includes('s') && pool.includes('t') && pool.includes('k') && pool.length === 3,
     'its slot goes to the next letter in line', pool.join(' '));
  a.w.close();
  // the next day it is back
  const y = log.map(r => Object.assign({}, r, { t: r.t - day }));
  const b = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2, __log:y,
                   __mastery: { 'pl:L:s': { n:25, ft:17, box:2, streak:1, last:now - day, ms:[3000] } } }, '?dev=probe');
  await sleep(150);
  ok(!b.w.__probe.isResting('s') && b.w.__probe.activePool('letter').includes('s'), 'and the next day it is back in play');
  b.w.close();
}
{
  // her name's letters jump the queue
  const a = boot({ name:'Ada', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2 }, '?dev=probe');
  await sleep(150);
  ok(a.w.__probe.activePool('letter').join('') === 'das', 'A FRESH CHILD CALLED ADA MEETS D AND A FIRST, then S', a.w.__probe.activePool('letter').join(' '));
  a.w.close();
  const b = boot({ name:'Ada', rate:.7, goal:20, lang:'nb', mode:'letters', prizes:[], day:'', restoredV:2 }, '?dev=probe');
  await sleep(150);
  ok(b.w.__probe.activePool('letter').join('') === 'asb', 'in Norwegian: A first, then the pool order', b.w.__probe.activePool('letter').join(' '));
  b.w.close();
}
{
  // words with a cluster or a softened first sound are gone; ą says the word it sits in, unchanged
  const src = readFileSync(APP, 'utf8');
  const gone = ["'słoń'", "'brat'", "'pies'", "'sko'", "'tre'", "'okse'"].filter(w => src.includes('{w:' + w));
  ok(!gone.length, 'NO PICTURE WORD STARTS WITH A CLUSTER OR A SOFTENED SOUND', gone.join(' '));
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2 }, '?dev=probe');
  await sleep(150);
  a.click('.flag[data-lang="pl"]'); await sleep(80);
  a.w.__probe.setWord({ kind:'letter', w:'dąb', e:'🌳' });
  a.clear();
  const tile = [...a.d.querySelectorAll('#word .cell')].find(c => c.textContent === 'Ą');
  tile.click(); await sleep(50);
  ok(a.said().includes('ą jak w słowie dąb'), 'a Ą tile says "ą jak w słowie dąb" (one rule with Pisz)', JSON.stringify(a.said()));
  a.clear();
  ok(/pawlo999\.github\.io\/pisz\/parent\.html/.test(a.d.getElementById('parent').textContent), 'the parent panel points to the one dashboard for both apps');
  a.w.close();
}
{
  // three buttons fit a phone
  const a = boot({ name:'Eve', rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2 }, '');
  const css = readFileSync(APP, 'utf8');
  ok(/\.opt\{width:clamp\(84px,min\(16\.5vh,27vw\),142px\)/.test(css), 'button width follows the screen width, so three fit 390 px');
  a.w.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
