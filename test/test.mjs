import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';

const APP = '/home/ps/priv/litery/index.html';
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

function boot(seed, query) {
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
  ok(a.screen() === 'play', 'back returns to the game');
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
      // letter question: find the right button by trying both
      a.clickBtn(0); await sleep(500);
      if (a.dead() > 0) a.clickBtn(1);
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
{
  // exactly the state her synced data showed: Polish S mastered, T and B not
  const mastery = {
    'pl:L:s': { n:12, ft:9, box:5, streak:3, last:Date.now(), ms:[3400] },
    'pl:L:t': { n:6,  ft:4, box:1, streak:0, last:Date.now(), ms:[3600] },
    'pl:L:b': { n:5,  ft:4, box:1, streak:0, last:Date.now(), ms:[3300] }
  };
  const a = boot({ rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'',
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
  const b2 = boot({ rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'',
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
  const a = boot({ rate:.7, goal:20, lang:'pl', mode:'letters', prizes:[], day:'', restoredV:2 },
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
  const a = boot({ rate:.7, goal:20, lang:'nb', mode:'letters', prizes:[], day:'',
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
  ok(tiles === 5, 'the duplicate closed the old album and opened a new one', String(tiles));
  ok(/5\/32/.test(title), 'and the title counts uniques', title);
  a.w.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
