'use strict';

// ============================================================
// データと共通ヘルパー
// ============================================================
const S = window.SILKS.map(o => Object.assign({}, o, { parsed: Silks.parse(o.silk) }))
  .sort((a, b) => b.wins.length - a.wins.length || a.id - b.id);
const byId = new Map(S.map(o => [o.id, o]));
const app = document.getElementById('app');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = a => a[Math.floor(Math.random() * a.length)];

const KINDS = { club: 'クラブ', corp: '法人', person: '個人' };
const COLOR_ORDER = ['黒', '白', '赤', '桃', '黄', '緑', '青', '水色', '紫', '薄紫', '茶', 'えび茶', 'ねずみ'];
// 枠番の色（選択肢の番号に使う）
const GATE = [
  { bg: '#FFFFFF', fg: '#141414', border: '#141414' },
  { bg: '#141414', fg: '#FFFFFF' },
  { bg: '#C8102E', fg: '#FFFFFF' },
  { bg: '#1C4FA0', fg: '#FFFFFF' },
];
const gateStyle = i => {
  const g = GATE[i % 4];
  return `background:${g.bg};color:${g.fg};${g.border ? `border:1px solid ${g.border};` : ''}`;
};

const silkImg = (o, size, extra = '') => Silks.svg(o.parsed, { size, label: `${o.name}の勝負服（${o.silk}）` }).replace('<svg ', `<svg class="silk ${extra}" `);

// 入力答えの表記ゆれを吸収する（ひらがな→カタカナ、小書き文字、ヴ、記号、全角半角）
const SMALL = { 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ', 'ヵ': 'カ', 'ヶ': 'ケ' };
function norm(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/ヴァ/g, 'バ').replace(/ヴィ/g, 'ビ').replace(/ヴェ/g, 'ベ').replace(/ヴォ/g, 'ボ').replace(/ヴ/g, 'ブ')
    .replace(/[ァィゥェォッャュョヮヵヶ]/g, c => SMALL[c])
    .replace(/[\s・･.．,、'’\-‐－―「」（）()]/g, '');
}
const nameMatches = (correct, input) => !!norm(input) && norm(correct) === norm(input);

// 服の似ている度合い（4択の紛らわしい選択肢や「似ている服」に使う）
function similarity(a, b) {
  const p = a.parsed, q = b.parsed;
  const t = x => (x ? x.t : '無地');
  let s = 0;
  if (p.body.c === q.body.c) s += 3;
  if (t(p.body.p) === t(q.body.p)) s += 2;
  if (p.body.p && q.body.p && p.body.p.c === q.body.p.c) s += 1;
  if (p.sleeve.c === q.sleeve.c) s += 1;
  if (t(p.sleeve.p) === t(q.sleeve.p)) s += 1;
  if (t(p.span) === t(q.span) && p.span) s += 2;
  return s;
}
function similarOwners(o, n, pool = S) {
  return pool.filter(x => x.id !== o.id)
    .map(x => ({ x, s: similarity(o, x) + Math.random() * 1.5 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(e => e.x);
}

// ============================================================
// 保存データ（苦手リスト・成績・覚えた問題）
// ============================================================
const STORE_KEY = 'silks-quiz:v1';
const emptyState = () => ({ miss: {}, known: {}, total: 0, correct: 0, settings: null, updatedAt: 0 });
const readLocal = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeLocal = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 保存できない環境では何もしない */ } };

let storeKey = STORE_KEY;
const state = emptyState();

function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, emptyState(), next);
}
function save() {
  state.updatedAt = Date.now();
  writeLocal(storeKey, state);
  scheduleSync();
}
const weakIds = () => new Set(Object.keys(state.miss).map(k => +k.split(':')[0]));

function updateBadge() {
  const n = Object.keys(state.miss).length;
  const b = document.getElementById('miss-badge');
  b.textContent = n;
  b.hidden = n === 0;
}

// ============================================================
// 馬主の詳細
// ============================================================
function winsHtml(o, max = 99) {
  if (!o.wins.length) return '<p class="note">2011年以降のJRA平地GI勝利はありません</p>';
  const rows = o.wins.slice(0, max).map(w => `<li><span class="w-year">${w.year}</span><span class="w-race">${esc(w.race)}</span><b>${esc(w.horse)}</b></li>`).join('');
  const more = o.wins.length > max ? `<li class="w-more">ほか${o.wins.length - max}勝</li>` : '';
  return `<ul class="wins">${rows}${more}</ul>`;
}

function infoHtml(o, { wins = 5 } = {}) {
  return `<dl class="facts">
      <dt>表記</dt><dd>${esc(o.silk)}</dd>
      <dt>種別</dt><dd>${KINDS[o.kind]}</dd>
      ${o.crown ? `<dt>冠名</dt><dd><span class="crown">${esc(o.crown)}</span></dd>` : ''}
      <dt>GI</dt><dd>${o.wins.length ? `${o.wins.length}勝（2011年以降）` : 'なし'}</dd>
    </dl>
    ${o.note ? `<p class="note">※ ${esc(o.note)}</p>` : ''}
    ${o.wins.length ? `<h3>この服で勝ったGI</h3>${winsHtml(o, wins)}` : ''}`;
}

const dlg = document.getElementById('detail');
function openDetail(id) {
  const o = byId.get(id);
  if (!o) return;
  const sims = similarOwners(o, 4).sort((a, b) => similarity(o, b) - similarity(o, a));
  dlg.innerHTML = `<div class="dlg-body">
    <div class="dlg-top">
      <div><p class="kicker">${KINDS[o.kind]}</p><h2>${esc(o.name)}</h2></div>
      <button class="close" aria-label="閉じる" data-close><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="dlg-silk">${silkImg(o, 180)}</div>
    ${infoHtml(o, { wins: 99 })}
    <h3>似ている勝負服</h3>
    <div class="mini-grid">${sims.map(x => `<button class="mini" data-id="${x.id}">${silkImg(x, 64)}<span>${esc(x.name)}</span></button>`).join('')}</div>
    <p class="source">出典：Wikipedia日本語版「${esc(o.source)}」</p>
  </div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
dlg.addEventListener('click', e => {
  if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
  const m = e.target.closest('[data-id]');
  if (m) openDetail(+m.dataset.id);
});
app.addEventListener('click', e => {
  const m = e.target.closest('.mini[data-id], .open-detail[data-id]');
  if (m) openDetail(+m.dataset.id);
});

// ============================================================
// 一覧
// ============================================================
const listUI = { q: '', kind: 'all' };

function renderList() {
  const counts = { all: S.length, club: 0, corp: 0, person: 0 };
  S.forEach(o => counts[o.kind]++);
  app.innerHTML = `
    <section class="toolbar">
      <label class="search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="search" id="q" placeholder="馬主名・冠名・服の色や柄で検索" value="${esc(listUI.q)}" aria-label="検索">
      </label>
      <div class="seg" id="kinds">${[['all', 'すべて'], ['club', 'クラブ'], ['corp', '法人'], ['person', '個人']].map(([k, v]) => `<button data-kind="${k}" aria-pressed="${listUI.kind === k}">${v} ${counts[k]}</button>`).join('')}</div>
    </section>
    <div class="list-head" aria-hidden="true"><span>番</span><span>服</span><span>馬主・冠名</span><span>GI勝</span></div>
    <ul class="owner-list" id="rows"></ul>
    <p class="meta" id="list-meta"></p>`;

  const draw = () => {
    const q = norm(listUI.q);
    const weak = weakIds();
    const rows = S.filter(o => (listUI.kind === 'all' || o.kind === listUI.kind)
      && (!q || [o.name, o.crown, o.silk].some(v => norm(v).includes(q))));
    document.getElementById('rows').innerHTML = rows.map((o, i) => `
      <li><button class="owner-row open-detail" data-id="${o.id}">
        <span class="num">${i + 1}</span>
        ${silkImg(o, 56)}
        <span class="who"><span class="nm">${weak.has(o.id) ? '<span class="dot" title="復習リストにあり"></span>' : ''}${esc(o.name)}${o.crown ? ` <span class="crown">${esc(o.crown)}</span>` : ''}</span><span class="nt">${esc(o.silk)}</span></span>
        <span class="g1">${o.wins.length || '–'}</span>
      </button></li>`).join('') || '<li class="empty">該当する馬主がいません</li>';
    document.getElementById('list-meta').textContent = `${rows.length}件・タップで詳細（GI勝はJRA平地GIの2011年以降）`;
  };
  document.getElementById('q').addEventListener('input', e => { listUI.q = e.target.value; draw(); });
  document.getElementById('kinds').addEventListener('click', e => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    listUI.kind = b.dataset.kind;
    document.querySelectorAll('#kinds [data-kind]').forEach(x => x.setAttribute('aria-pressed', x === b));
    draw();
  });
  draw();
}

// ============================================================
// 切り口（胴の色・柄・袖・種別でまとめる）
// ============================================================
const AXES = { color: '胴の色', pattern: '胴の柄', sleeve: '袖の柄', kind: '種別' };
const groupUI = { axis: 'color' };

function groupKey(o, axis) {
  const p = o.parsed;
  if (axis === 'color') return p.body.c;
  if (axis === 'pattern') {
    if (p.span) return p.span.t;
    if (!p.body.p) return '無地';
    return p.body.p.t.replace(/^[一二三]本輪$/, '輪（一本〜三本）').replace(/^山形.*/, '山形');
  }
  if (axis === 'sleeve') {
    if (p.sleeve.p) return p.sleeve.p.t.replace(/^[一二三]本輪$/, '輪（一本〜三本）');
    return p.sleeve.c !== p.body.c ? '色違いの袖（無地）' : '胴と同じ（無地）';
  }
  return KINDS[o.kind];
}

function renderGroup() {
  const { axis } = groupUI;
  const m = new Map();
  for (const o of S) {
    const k = groupKey(o, axis);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(o);
  }
  let groups = [...m.entries()];
  if (axis === 'color') groups.sort((a, b) => COLOR_ORDER.indexOf(a[0]) - COLOR_ORDER.indexOf(b[0]));
  else if (axis === 'kind') groups.sort((a, b) => Object.values(KINDS).indexOf(a[0]) - Object.values(KINDS).indexOf(b[0]));
  else groups.sort((a, b) => b[1].length - a[1].length);

  app.innerHTML = `
    <p class="lead">同じ色・同じ柄の服をまとめて見ると、違いに目が行って覚えやすくなります。</p>
    <div class="seg" id="axes">${Object.entries(AXES).map(([k, v]) => `<button data-axis="${k}" aria-pressed="${axis === k}">${v}</button>`).join('')}</div>
    <div class="groups">${groups.map(([k, list]) => `
      <section class="group">
        <h2 class="g-head">${axis === 'color' ? `<span class="swatch" style="background:${Silks.COLORS[k]}"></span>` : ''}${esc(k)}<span class="g-count">${list.length}</span></h2>
        <div class="mini-grid">${list.map(o => `<button class="mini" data-id="${o.id}">${silkImg(o, 64)}<span>${esc(o.name)}</span></button>`).join('')}</div>
        <div class="row end"><button class="btn small" data-quiz="${esc(k)}">この切り口でクイズ</button></div>
      </section>`).join('')}
    </div>`;

  document.getElementById('axes').addEventListener('click', e => {
    const b = e.target.closest('[data-axis]');
    if (b) { groupUI.axis = b.dataset.axis; renderGroup(); }
  });
  app.querySelectorAll('[data-quiz]').forEach(b => b.addEventListener('click', () => {
    // 同じグループの中で見分ける問題にする（似た服同士の4択になる）
    const members = S.filter(o => groupKey(o, axis) === b.dataset.quiz);
    const keys = shuffle(members).flatMap(o => [`${o.id}:silk-owner`, `${o.id}:owner-silk`]).filter(keepByKnown).slice(0, 10);
    startSession(shuffle(keys), { mode: 'choice', title: `${AXES[axis]}「${b.dataset.quiz}」`, pool: members.length >= 4 ? members : null });
    location.hash = '#quiz';
  }));
}

// ============================================================
// 暗記カード
// ============================================================
const cardUI = { front: 'silk', kind: 'all', weakOnly: false, order: null, i: 0, flipped: false, sides: [] };

function buildCards() {
  const weak = weakIds();
  const list = S.filter(o => (cardUI.kind === 'all' || o.kind === cardUI.kind) && (!cardUI.weakOnly || weak.has(o.id)));
  cardUI.order = shuffle(list.map(o => o.id));
  cardUI.sides = cardUI.order.map(() => (cardUI.front === 'random' ? pick(['silk', 'name']) : cardUI.front));
  cardUI.i = 0;
  cardUI.flipped = false;
}

function renderCards() {
  if (!cardUI.order) buildCards();
  const total = cardUI.order.length;
  const o = byId.get(cardUI.order[cardUI.i]);
  const side = cardUI.sides[cardUI.i];
  let face = '<div class="empty">該当するカードがありません</div>';
  if (o) {
    if (!cardUI.flipped) {
      face = side === 'silk'
        ? `<div class="face">${silkImg(o, 200)}<p class="hint">タップでめくる</p></div>`
        : `<div class="face"><p class="kicker">${KINDS[o.kind]}</p><p class="big">${esc(o.name)}</p>${o.crown ? `<p><span class="crown">${esc(o.crown)}</span></p>` : ''}<p class="hint">タップでめくる</p></div>`;
    } else {
      face = `<div class="face back">${silkImg(o, 120)}<p class="big">${esc(o.name)}</p><p class="nt">${esc(o.silk)}</p>
        ${o.crown ? `<p><span class="crown">${esc(o.crown)}</span></p>` : ''}
        ${o.wins.length ? `<p class="note">${o.wins.slice(0, 3).map(w => esc(w.horse)).filter((v, i, a) => a.indexOf(v) === i).join('・')} など GI ${o.wins.length}勝</p>` : ''}</div>`;
    }
  }
  app.innerHTML = `
    <div class="toolbar">
      <div class="seg" id="c-front">${[['silk', '服を見て'], ['name', '名前を見て'], ['random', 'ランダム']].map(([k, v]) => `<button data-front="${k}" aria-pressed="${cardUI.front === k}">${v}</button>`).join('')}</div>
      <div class="row">
        <div class="seg small" id="c-kind">${[['all', 'すべて'], ['club', 'クラブ'], ['corp', '法人'], ['person', '個人']].map(([k, v]) => `<button data-kind="${k}" aria-pressed="${cardUI.kind === k}">${v}</button>`).join('')}</div>
        <label class="toggle"><input type="checkbox" id="c-weak" ${cardUI.weakOnly ? 'checked' : ''}> 復習リストのみ</label>
      </div>
    </div>
    <div class="card-stage">
      <button class="flashcard" id="card" aria-label="カードをめくる">${face}</button>
      <div class="card-progress">${total ? cardUI.i + 1 : 0} / ${total}</div>
      <div class="row center">
        <button class="btn" id="c-prev" ${cardUI.i <= 0 ? 'disabled' : ''}>← 前へ</button>
        <button class="btn ghost" id="c-shuffle">シャッフル</button>
        <button class="btn primary" id="c-next" ${cardUI.i >= total - 1 ? 'disabled' : ''}>次へ →</button>
      </div>
    </div>`;
  const go = d => {
    const n = cardUI.i + d;
    if (n < 0 || n >= total) return;
    cardUI.i = n;
    cardUI.flipped = false;
    renderCards();
  };
  cardUI.go = go;
  document.getElementById('card').addEventListener('click', () => { cardUI.flipped = !cardUI.flipped; renderCards(); });
  document.getElementById('c-prev').addEventListener('click', () => go(-1));
  document.getElementById('c-next').addEventListener('click', () => go(1));
  document.getElementById('c-shuffle').addEventListener('click', () => { buildCards(); renderCards(); });
  document.getElementById('c-front').addEventListener('click', e => {
    const b = e.target.closest('[data-front]');
    if (b) { cardUI.front = b.dataset.front; buildCards(); renderCards(); }
  });
  document.getElementById('c-kind').addEventListener('click', e => {
    const b = e.target.closest('[data-kind]');
    if (b) { cardUI.kind = b.dataset.kind; buildCards(); renderCards(); }
  });
  document.getElementById('c-weak').addEventListener('change', e => { cardUI.weakOnly = e.target.checked; buildCards(); renderCards(); });
}

// ============================================================
// クイズ：問題の作り方
// ============================================================
const TYPES = {
  'silk-owner': '服 → 馬主',
  'owner-silk': '馬主 → 服',
  'silk-notation': '服 → 表記',
  'notation-silk': '表記 → 服',
  'crown-owner': '冠名 → 馬主',
  'horse-silk': 'GI馬 → 服',
};
const DEFAULT_TYPES = ['silk-owner', 'owner-silk', 'horse-silk'];

// key は「馬主id:種類」または「馬主id:horse-silk:勝利の番号」
function makeQuestion(key, pool) {
  const [idStr, type, extra] = key.split(':');
  const o = byId.get(+idStr);
  if (!o || !TYPES[type]) return null;
  const others = similarOwners(o, 3, pool && pool.some(x => x.id === o.id) ? pool : S);
  const ownersAsChoices = list => list.map(x => ({ value: String(x.id), label: x.name, silk: x }));
  const q = { key, type, o, label: TYPES[type], answer: String(o.id) };

  if (type === 'silk-owner') {
    return Object.assign(q, {
      prompt: 'この勝負服の馬主は？', visual: o, kind: 'text',
      choices: ownersAsChoices([o, ...others]), check: v => nameMatches(o.name, v), inputHint: '馬主名を入力（カタカナ・ひらがなどちらでもOK）', hintText: o.name,
    });
  }
  if (type === 'owner-silk') {
    return Object.assign(q, {
      prompt: `${o.name}の勝負服は？`, sub: `${KINDS[o.kind]}${o.crown ? `・冠名「${o.crown}」` : ''}`, kind: 'silk', choiceOnly: true,
      choices: ownersAsChoices([o, ...others]),
    });
  }
  if (type === 'silk-notation') {
    return Object.assign(q, {
      prompt: 'この勝負服の表記は？', visual: o, kind: 'text', choiceOnly: true,
      choices: [o, ...others].map(x => ({ value: String(x.id), label: x.silk })),
    });
  }
  if (type === 'notation-silk') {
    return Object.assign(q, {
      prompt: `「${o.silk}」はどれ？`, kind: 'silk', choiceOnly: true,
      choices: ownersAsChoices([o, ...others]),
    });
  }
  if (type === 'crown-owner') {
    if (!o.crown) return null;
    const crowned = S.filter(x => x.id !== o.id && x.crown);
    const opts = shuffle(crowned).slice(0, 3);
    return Object.assign(q, {
      prompt: `冠名「${o.crown}」の馬主は？`, kind: 'text',
      choices: ownersAsChoices([o, ...opts]), check: v => nameMatches(o.name, v), inputHint: '馬主名を入力', hintText: o.name,
    });
  }
  if (type === 'horse-silk') {
    const w = o.wins[+extra];
    if (!w) return null;
    return Object.assign(q, {
      prompt: `${w.horse}の勝負服は？`, sub: `${w.year}年 ${w.race}`, kind: 'silk', choiceOnly: true,
      choices: ownersAsChoices([o, ...others.filter(x => !x.wins.some(v => v.horse === w.horse))]),
    });
  }
  return null;
}

// 「もう覚えた」にした問題は出題確率を 1/5 に下げる
const KNOWN_RATE = 0.2;
const keepByKnown = key => !state.known[key] || Math.random() < KNOWN_RATE;

// ============================================================
// クイズ：画面
// ============================================================
const defaultSettings = { types: DEFAULT_TYPES, mode: 'choice', kind: 'all', n: 10, hint: false };
const settings = Object.assign({}, defaultSettings);
let session = null;

function initialOf(name) {
  const m = name.match(/^.[ァィゥェォャュョヮぁぃぅぇぉゃゅょゎ]?/u);
  return m ? m[0] : '';
}

function startSession(keys, { mode = settings.mode, title = 'クイズ', review = false, pool = null } = {}) {
  const qs = keys.map(k => makeQuestion(k, pool)).filter(Boolean).map(q => Object.assign(q, { choices: shuffle(q.choices) }));
  session = { qs, i: 0, mode, title, review, hint: settings.hint, results: [], answered: null };
}

function buildKeysFromSettings() {
  const pool = shuffle(S.filter(o => settings.kind === 'all' || o.kind === settings.kind));
  const keys = [];
  for (let i = 0; keys.length < settings.n && i < settings.n * 20; i++) {
    const o = pool[i % pool.length];
    const t = pick(settings.types);
    let key = `${o.id}:${t}`;
    if (t === 'crown-owner' && !o.crown) continue;
    if (t === 'horse-silk') {
      if (!o.wins.length) continue;
      key += `:${Math.floor(Math.random() * Math.min(o.wins.length, 8))}`;
    }
    if (!keepByKnown(key) || keys.includes(key)) continue;
    keys.push(key);
  }
  return keys;
}

function renderQuiz() {
  if (!session) return renderQuizSettings();
  if (session.i >= session.qs.length) return renderQuizResult();
  renderQuestion();
}

function renderQuizSettings() {
  const rate = state.total ? Math.round((state.correct / state.total) * 100) : 0;
  app.innerHTML = `
    <div class="panel">
      <h2 class="title-bar">クイズの設定</h2>
      <form class="settings" id="qs-form">
        <fieldset>
          <legend>出題パターン（複数選択可）</legend>
          <div class="checks">${Object.entries(TYPES).map(([k, v]) => `<label class="check"><input type="checkbox" name="types" value="${k}" ${settings.types.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
        </fieldset>
        <fieldset>
          <legend>答え方</legend>
          <div class="seg" data-group="mode">
            <button type="button" data-v="choice" aria-pressed="${settings.mode === 'choice'}">4択</button>
            <button type="button" data-v="input" aria-pressed="${settings.mode === 'input'}">入力</button>
          </div>
          <p class="note">「入力」は、馬主名を答える問題（服→馬主、冠名→馬主）だけが対象です。それ以外は4択で出ます。</p>
          <label class="toggle"><input type="checkbox" name="hint" ${settings.hint ? 'checked' : ''}> 馬主名の頭文字をヒントに出す（入力のとき）</label>
        </fieldset>
        <fieldset>
          <legend>範囲</legend>
          <div class="seg" data-group="kind">${[['all', 'すべて'], ['club', 'クラブ'], ['corp', '法人'], ['person', '個人']].map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${settings.kind === k}">${v}</button>`).join('')}</div>
        </fieldset>
        <fieldset>
          <legend>問題数</legend>
          <div class="seg" data-group="n">${[10, 20, 30, 50].map(n => `<button type="button" data-v="${n}" aria-pressed="${settings.n === n}">${n}問</button>`).join('')}</div>
        </fieldset>
        <div class="row between">
          <div class="stats"><span><b>${state.total}</b>問 解答</span><span>正答率 <b>${rate}</b>%</span><span>復習 <b>${Object.keys(state.miss).length}</b>件</span><span>覚えた <b>${Object.keys(state.known).length}</b>問</span></div>
          <button class="btn primary" type="submit" id="qs-start">スタート</button>
        </div>
      </form>
    </div>`;
  const form = document.getElementById('qs-form');
  const syncStart = () => { document.getElementById('qs-start').disabled = settings.types.length === 0; };
  form.addEventListener('change', e => {
    if (e.target.name === 'types') {
      settings.types = [...form.querySelectorAll('input[name=types]:checked')].map(i => i.value);
      syncStart();
    }
    if (e.target.name === 'hint') settings.hint = e.target.checked;
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const g = b.parentElement.dataset.group;
    settings[g] = g === 'n' ? +b.dataset.v : b.dataset.v;
    b.parentElement.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!settings.types.length) return;
    state.settings = settings;
    save();
    startSession(buildKeysFromSettings());
    renderQuiz();
  });
  syncStart();
}

function renderQuestion() {
  const s = session;
  const q = s.qs[s.i];
  const ans = s.answered;
  const inputMode = s.mode === 'input' && !q.choiceOnly;
  const nextLabel = s.i + 1 < s.qs.length ? '次へ →' : '結果を見る';
  const seg = Array.from({ length: s.qs.length }, (_, i) => {
    const r = s.results[i];
    return `<span class="${r ? (r.ok ? 'ok' : 'ng') : i === s.i ? 'cur' : ''}"></span>`;
  }).join('');

  let body;
  if (inputMode) {
    body = `<form class="answer-form" id="ans-form" autocomplete="off">
        <input type="text" id="ans" placeholder="答えを入力" value="${ans ? esc(ans.input) : ''}" ${ans ? 'disabled' : ''} aria-label="答え">
        ${ans ? `<button class="btn primary" type="button" id="next">${nextLabel}</button>` : '<button class="btn primary" type="submit">答える</button>'}
      </form>
      ${ans ? '' : `<div class="row between"><p class="note">${esc(q.inputHint || '')}</p><button class="btn ghost small" id="giveup">わからない</button></div>`}`;
  } else if (q.kind === 'silk') {
    body = `<div class="silk-choices">${q.choices.map((c, i) => {
      const cls = ans ? (c.value === q.answer ? 'correct' : c.value === ans.input ? 'wrong' : '') : '';
      return `<button class="silk-choice ${cls}" data-c="${esc(c.value)}" ${ans ? 'disabled' : ''} aria-label="${i + 1}番 ${esc(c.silk.silk)}">
        <span class="gate" style="${gateStyle(i)}">${i + 1}</span>${silkImg(c.silk, 112)}${ans ? `<span class="cap">${esc(c.label)}</span>` : ''}</button>`;
    }).join('')}</div>`;
  } else {
    body = `<div class="choices">${q.choices.map((c, i) => {
      const cls = ans ? (c.value === q.answer ? 'correct' : c.value === ans.input ? 'wrong' : '') : '';
      const mark = ans ? (c.value === q.answer ? '<span class="mark ok">◎</span>' : c.value === ans.input ? '<span class="mark ng">×</span>' : '') : '';
      return `<button class="choice ${cls}" data-c="${esc(c.value)}" ${ans ? 'disabled' : ''}><span class="gate" style="${gateStyle(i)}">${i + 1}</span><span class="lbl">${esc(c.label)}</span>${mark}</button>`;
    }).join('')}</div>`;
  }

  let fb = '';
  if (ans) {
    fb = `<div class="verdict ${ans.ok ? 'ok' : 'ng'}">
        <div><p class="v-title">${ans.ok ? '◎ 的中' : '× ハズレ'}</p>${!ans.ok ? `<p class="v-sub">正解：${esc(q.o.name)}${inputMode && ans.input ? `（あなたの答え：${esc(ans.input)}）` : ''}</p>` : ''}</div>
        <div class="v-actions">
          ${ans.ok ? `<button class="known-btn" id="known" aria-pressed="${!!state.known[q.key]}">もう覚えた</button>` : ''}
          ${inputMode ? '' : `<button class="btn primary" id="next">${nextLabel}</button>`}
        </div>
      </div>
      <div class="feedback">
        <div class="fb-head">${silkImg(q.o, 88)}<div><p class="kicker">${KINDS[q.o.kind]}</p><h3>${esc(q.o.name)}</h3></div></div>
        ${infoHtml(q.o, { wins: 3 })}
        <div class="row end"><button class="btn small open-detail" data-id="${q.o.id}">詳しく見る</button></div>
      </div>`;
  }

  app.innerHTML = `
    <div class="q-top">
      <div class="row between">
        <div class="row"><span class="q-no">${s.i + 1}問目</span><span class="q-total">全${s.qs.length}問</span></div>
        <span class="q-label">${esc(q.label)}</span>
      </div>
      <div class="q-seg" style="grid-template-columns:repeat(${s.qs.length},minmax(0,1fr))">${seg}</div>
    </div>
    <section class="q-card">
      <h1 class="q-prompt">${esc(q.prompt)}</h1>
      ${q.sub ? `<p class="q-sub">${esc(q.sub)}</p>` : ''}
      ${q.visual ? `<div class="q-visual">${silkImg(q.visual, 190)}</div>` : ''}
      ${inputMode && s.hint && !ans ? `<p class="q-hint">ヒント：<b>${esc(initialOf(q.hintText))}</b> から始まる</p>` : ''}
    </section>
    ${body}
    ${fb}
    <div class="row end"><button class="btn ghost small" id="quit">やめる</button></div>`;

  app.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => answer(b.dataset.c)));
  const form = document.getElementById('ans-form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = document.getElementById('ans').value.trim();
      if (v) answer(v);
    });
    if (!ans) document.getElementById('ans').focus();
  }
  document.getElementById('giveup')?.addEventListener('click', () => answer(''));
  document.getElementById('next')?.addEventListener('click', nextQuestion);
  document.getElementById('known')?.addEventListener('click', e => {
    const on = !state.known[q.key];
    if (on) state.known[q.key] = Date.now();
    else delete state.known[q.key];
    e.currentTarget.setAttribute('aria-pressed', on);
    save();
  });
  document.getElementById('quit').addEventListener('click', () => { session = null; renderQuiz(); });
  if (ans) document.getElementById('next').focus({ preventScroll: true });
}

function answer(input) {
  const s = session;
  if (s.answered) return;
  const q = s.qs[s.i];
  const inputMode = s.mode === 'input' && !q.choiceOnly;
  const ok = inputMode ? q.check(input) : input === q.answer;
  s.answered = { input, ok };
  s.results[s.i] = { key: q.key, ok };
  state.total++;
  if (ok) {
    state.correct++;
    delete state.miss[q.key];
  } else {
    const m = state.miss[q.key] || { n: 0 };
    state.miss[q.key] = { n: m.n + 1, at: Date.now() };
    delete state.known[q.key];
  }
  save();
  updateBadge();
  renderQuestion();
}

function nextQuestion() {
  session.i++;
  session.answered = null;
  renderQuiz();
  window.scrollTo({ top: 0 });
}

function renderQuizResult() {
  const s = session;
  const okN = s.results.filter(r => r && r.ok).length;
  const wrong = s.results.filter(r => r && !r.ok).map(r => makeQuestion(r.key)).filter(Boolean);
  app.innerHTML = `
    <div class="panel">
      <p class="meta">${esc(s.title)}の結果</p>
      <p class="score">${okN}<small> / ${s.results.length} 的中</small></p>
      ${wrong.length ? `<h3>ハズレた問題（復習リストに追加済み）</h3>
        <ul class="miss-list">${wrong.map(q => `<li><button class="miss-row open-detail" data-id="${q.o.id}">${silkImg(q.o, 48)}<span><span class="m-q">${esc(q.label)}｜${esc(q.prompt)}</span><span class="m-a">${esc(q.o.name)}</span></span></button></li>`).join('')}</ul>`
        : '<p>全問的中です！</p>'}
      <div class="row">
        ${wrong.length ? '<button class="btn primary" id="retry-wrong">ハズレた問題をもう一度</button>' : ''}
        <button class="btn" id="again">もう一度</button>
        <button class="btn ghost" id="to-settings">設定に戻る</button>
      </div>
    </div>`;
  document.getElementById('retry-wrong')?.addEventListener('click', () => {
    startSession(shuffle(wrong.map(q => q.key)), { mode: s.mode, title: 'ハズレた問題', review: true });
    renderQuiz();
  });
  document.getElementById('again').addEventListener('click', () => {
    if (s.title !== 'クイズ') startSession(shuffle(s.qs.map(q => q.key)), { mode: s.mode, title: s.title, review: s.review });
    else startSession(buildKeysFromSettings());
    renderQuiz();
  });
  document.getElementById('to-settings').addEventListener('click', () => { session = null; renderQuiz(); });
}

// ============================================================
// 復習
// ============================================================
const reviewUI = { mode: 'choice' };

function renderReview() {
  const entries = Object.entries(state.miss)
    .map(([key, v]) => ({ key, q: makeQuestion(key), n: v.n, at: v.at }))
    .filter(e => e.q)
    .sort((a, b) => b.n - a.n || b.at - a.at);
  const known = Object.entries(state.known)
    .map(([key, at]) => ({ key, q: makeQuestion(key), at }))
    .filter(e => e.q)
    .sort((a, b) => b.at - a.at);
  const row = (e, btn) => `<li><div class="miss-row">${silkImg(e.q.o, 48)}<span><span class="m-q">${esc(e.q.label)}｜${esc(e.q.prompt)}</span><span class="m-a">${esc(e.q.o.name)}</span></span>${btn}</div></li>`;

  const missPanel = entries.length ? `
    <div class="panel">
      <h2 class="title-bar">復習リスト<span>${entries.length}件</span></h2>
      <p class="lead">ハズレた問題だけを出題します。的中するとリストから外れます。</p>
      <div class="row between">
        <div class="seg" id="rv-mode">
          <button data-v="choice" aria-pressed="${reviewUI.mode === 'choice'}">4択</button>
          <button data-v="input" aria-pressed="${reviewUI.mode === 'input'}">入力</button>
        </div>
        ${reviewUI.mode === 'input' ? `<label class="toggle"><input type="checkbox" id="rv-hint" ${settings.hint ? 'checked' : ''}> 頭文字ヒント</label>` : ''}
        <button class="btn primary" id="rv-start">復習スタート（${Math.min(entries.length, 20)}問）</button>
      </div>
      <h3>苦手な問題（ハズレた回数順）</h3>
      <ul class="miss-list">${entries.map(e => row(e, `<span class="m-n">×${e.n}</span><button class="btn ghost small" data-del="${esc(e.key)}" aria-label="リストから外す">外す</button>`)).join('')}</ul>
      <div class="row end"><button class="btn ghost small" id="rv-clear">リストを全部消す</button></div>
    </div>` : `
    <div class="panel empty">
      <p>復習リストは空です。</p>
      <p class="note">クイズでハズレた問題がここにたまります。的中するとリストから外れます。</p>
      <a class="btn primary" href="#quiz">クイズをする</a>
    </div>`;

  const knownPanel = known.length ? `
    <div class="panel">
      <h2 class="title-bar">覚えた問題<span>${known.length}問</span></h2>
      <p class="lead">「もう覚えた」にした問題は、出題される確率が1/5になります。ハズレると自動で外れます。</p>
      <ul class="miss-list">${known.map(e => row(e, `<button class="btn ghost small" data-unknown="${esc(e.key)}" aria-label="覚えた問題から外す">外す</button>`)).join('')}</ul>
    </div>` : '';

  app.innerHTML = missPanel + knownPanel;

  document.getElementById('rv-mode')?.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (b) { reviewUI.mode = b.dataset.v; renderReview(); }
  });
  document.getElementById('rv-hint')?.addEventListener('change', e => {
    settings.hint = e.target.checked;
    state.settings = settings;
    save();
  });
  document.getElementById('rv-start')?.addEventListener('click', () => {
    startSession(shuffle(entries.slice(0, 20).map(e => e.key)), { mode: reviewUI.mode, title: '復習', review: true });
    location.hash = '#quiz';
  });
  app.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    delete state.miss[b.dataset.del];
    save();
    updateBadge();
    renderReview();
  }));
  app.querySelectorAll('[data-unknown]').forEach(b => b.addEventListener('click', () => {
    delete state.known[b.dataset.unknown];
    save();
    renderReview();
  }));
  document.getElementById('rv-clear')?.addEventListener('click', () => {
    if (!confirm('復習リストを全部消しますか？')) return;
    state.miss = {};
    save();
    updateBadge();
    renderReview();
  });
}

// ============================================================
// キーボード操作・画面切り替え
// ============================================================
document.addEventListener('keydown', e => {
  if (dlg.open || accountDlg.open || document.body.classList.contains('locked') || e.metaKey || e.ctrlKey || e.altKey) return;
  const view = currentView();
  const typing = e.target.matches('input, textarea, select');
  if (view === 'cards' && !typing) {
    if (e.key === ' ') { e.preventDefault(); cardUI.flipped = !cardUI.flipped; renderCards(); }
    if (e.key === 'ArrowRight') cardUI.go?.(1);
    if (e.key === 'ArrowLeft') cardUI.go?.(-1);
  }
  if (view === 'quiz' && session && session.i < session.qs.length && !typing && !session.answered && /^[1-4]$/.test(e.key)) {
    const q = session.qs[session.i];
    if (session.mode === 'input' && !q.choiceOnly) return;
    const c = q.choices[+e.key - 1];
    if (c) answer(c.value);
  }
});

const VIEWS = { list: renderList, group: renderGroup, cards: renderCards, quiz: renderQuiz, review: renderReview };
const currentView = () => (location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'list');

function route() {
  const v = currentView();
  document.querySelectorAll('.tabs a').forEach(a => {
    if (a.dataset.view === v) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  VIEWS[v]();
  updateBadge();
}

// ============================================================
// アカウント（Supabase）と同期 ※ダービー馬暗記帳と同じアカウント・別テーブル
// ============================================================
const cfg = window.SILKS_CONFIG || {};
const sb = window.supabase && cfg.supabaseUrl ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
const TABLE = cfg.table || 'silks_progress';
const account = { user: null, status: '' }; // status: saving / saved / error
const accountBtn = document.getElementById('account-btn');
const accountDlg = document.getElementById('account');
let syncTimer = null;

const displayName = u => (u.user_metadata && u.user_metadata.name) || u.email.split('@')[0];
const hasProgress = s => s && (s.total > 0 || Object.keys(s.miss || {}).length > 0);

function updateAccountBtn() {
  accountBtn.hidden = !account.user;
  if (!account.user) return;
  accountBtn.textContent = displayName(account.user);
  accountBtn.dataset.status = account.status;
}

function scheduleSync() {
  if (!account.user) return;
  account.status = 'saving';
  updateAccountBtn();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushRemote, 800);
}

async function pushRemote() {
  clearTimeout(syncTimer);
  syncTimer = null;
  if (!account.user) return;
  const { error } = await sb.from(TABLE).upsert({
    user_id: account.user.id, data: state, updated_at: new Date(state.updatedAt || Date.now()).toISOString(),
  });
  account.status = error ? 'error' : 'saved';
  updateAccountBtn();
}

// 複数端末で同じアカウントを使うので、新しく更新された方を採用する
async function pullRemote() {
  const { data, error } = await sb.from(TABLE).select('data').eq('user_id', account.user.id).maybeSingle();
  if (error) { account.status = 'error'; return; }
  const remote = data && data.data;
  if (remote && (remote.updatedAt || 0) >= (state.updatedAt || 0)) {
    replaceState(remote);
    writeLocal(storeKey, state);
  } else if (hasProgress(state)) {
    await pushRemote();
  }
  account.status = 'saved';
}

async function switchToUser(user) {
  account.user = user;
  storeKey = `${STORE_KEY}:${user.id}`;
  replaceState(readLocal(storeKey) || {});
  await pullRemote();
  Object.assign(settings, defaultSettings, state.settings || {});
  updateAccountBtn();
  unlock();
}

async function logout() {
  if (syncTimer) await pushRemote();
  await sb.auth.signOut();
  account.user = null;
  account.status = '';
  storeKey = STORE_KEY;
  replaceState({});
  session = null;
  cardUI.order = null;
  updateAccountBtn();
  lock();
}

// ============================================================
// ログイン画面（未ログインのときはコンテンツを表示しない）
// ============================================================
const gate = document.getElementById('gate');

function lock(message) {
  document.body.classList.add('locked');
  app.innerHTML = '';
  if (dlg.open) dlg.close();
  if (message) {
    gate.innerHTML = `<div class="panel gate-panel"><p class="lead">${esc(message)}</p></div>`;
    return;
  }
  gate.innerHTML = `<div class="panel gate-panel">
    <h2 class="title-bar">ログイン</h2>
    <p class="lead">このアプリは登録したメンバー専用です。ダービー馬暗記帳と同じアカウントでログインできます。</p>
    <form id="login-form" class="settings">
      <input type="email" name="email" placeholder="メールアドレス" autocomplete="username" required aria-label="メールアドレス">
      <input type="password" name="password" placeholder="パスワード" autocomplete="current-password" required aria-label="パスワード">
      <p class="login-error" id="login-error" hidden></p>
      <button class="btn primary" type="submit">ログイン</button>
    </form>
  </div>`;
  const form = gate.querySelector('#login-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const err = gate.querySelector('#login-error');
    btn.disabled = true;
    err.hidden = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
    if (error) {
      btn.disabled = false;
      err.textContent = /invalid login credentials/i.test(error.message) ? 'メールアドレスかパスワードが違います' : `ログインできませんでした（${error.message}）`;
      err.hidden = false;
      return;
    }
    await switchToUser(data.user);
  });
  form.email.focus();
}

function unlock() {
  gate.innerHTML = '';
  document.body.classList.remove('locked');
  route();
}

const STATUS_TEXT = { saving: '保存中…', saved: 'クラウドに保存済み', error: '保存に失敗しました（通信を確認してください）' };

function openAccount() {
  if (!account.user) return;
  accountDlg.innerHTML = `<div class="dlg-body">
    <div class="dlg-top"><h2>${esc(displayName(account.user))}</h2><button class="close" aria-label="閉じる" data-close><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <p class="meta">${esc(account.user.email)}</p>
    <p>${esc(STATUS_TEXT[account.status] || '')}</p>
    <p class="note">成績と復習リストはこのアカウントに保存され、ログインしたどの端末でも同じ内容になります。ログアウトすると、ダービー馬暗記帳からもログアウトします。</p>
    <details class="pw-change">
      <summary>パスワードを変更する</summary>
      <form id="pw-form" class="settings">
        <input type="email" name="username" value="${esc(account.user.email)}" autocomplete="username" hidden>
        <input type="password" name="pw1" placeholder="新しいパスワード（6文字以上）" autocomplete="new-password" minlength="6" required aria-label="新しいパスワード">
        <input type="password" name="pw2" placeholder="新しいパスワード（確認）" autocomplete="new-password" minlength="6" required aria-label="新しいパスワード（確認）">
        <p class="login-error" id="pw-error" hidden></p>
        <p class="form-ok" id="pw-ok" hidden>パスワードを変更しました。次回からは新しいパスワードでログインしてください。</p>
        <button class="btn primary" type="submit">変更する</button>
      </form>
    </details>
    <div class="row end"><button class="btn" id="logout">ログアウト</button></div>
  </div>`;
  accountDlg.querySelector('#logout').addEventListener('click', async () => { accountDlg.close(); await logout(); });
  const pwForm = accountDlg.querySelector('#pw-form');
  pwForm.addEventListener('submit', async e => {
    e.preventDefault();
    const err = accountDlg.querySelector('#pw-error');
    const ok = accountDlg.querySelector('#pw-ok');
    const btn = pwForm.querySelector('button[type=submit]');
    err.hidden = true;
    ok.hidden = true;
    if (pwForm.pw1.value !== pwForm.pw2.value) {
      err.textContent = '2つの入力が一致しません';
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: pwForm.pw1.value });
    btn.disabled = false;
    if (error) {
      const m = error.message;
      err.textContent = /different from the old/i.test(m) ? '今と同じパスワードです。別のパスワードにしてください'
        : /at least|weak/i.test(m) ? 'パスワードが短すぎるか、簡単すぎます。6文字以上で、推測されにくいものにしてください'
        : /reauthenticat|nonce/i.test(m) ? '本人確認が必要な設定になっています。管理者に連絡してください'
        : `変更できませんでした（${m}）`;
      err.hidden = false;
      return;
    }
    pwForm.reset();
    ok.hidden = false;
  });
  accountDlg.showModal();
}
accountDlg.addEventListener('click', e => {
  if (e.target === accountDlg || e.target.closest('[data-close]')) accountDlg.close();
});
accountBtn.addEventListener('click', openAccount);

// 画面を閉じる・アプリを切り替える前に、未送信の変更を送る
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && syncTimer) pushRemote();
});

async function initAccount() {
  updateAccountBtn();
  if (!sb) return lock('ログインサービスに接続できませんでした。通信状況を確認して、ページを再読み込みしてください。');
  const { data } = await sb.auth.getSession();
  if (data.session) await switchToUser(data.session.user);
  else lock();
}

document.getElementById('count').textContent = S.length;
window.addEventListener('hashchange', () => {
  if (document.body.classList.contains('locked')) return;
  route();
  window.scrollTo({ top: 0 });
});
initAccount();
