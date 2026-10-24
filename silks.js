// 勝負服の表記（例：「黒、赤十字襷、袖黄縦縞」）を読み取り、SVG で描く
(function (root) {
  'use strict';

  // JRA の服色に使える13色（画面で見やすいように少しだけ調整した色）
  const COLORS = {
    '赤': '#E2231A', '桃': '#F28DB2', '黄': '#FFD400', '緑': '#008C45', '青': '#1C4FA0',
    '水色': '#46B1E1', '紫': '#7B3F9E', '薄紫': '#C8A6DA', '茶': '#8A5A2E', 'えび茶': '#7A2E2A',
    'ねずみ': '#8D8F94', '黒': '#1B1B1D', '白': '#FFFFFF',
  };
  const COLOR_ALIASES = [['えび茶', 'えび茶'], ['海老茶', 'えび茶'], ['海老', 'えび茶'], ['薄紫', '薄紫'], ['水色', '水色'],
    ['ねずみ', 'ねずみ'], ['鼠', 'ねずみ'], ['赤', '赤'], ['桃', '桃'], ['黄', '黄'], ['緑', '緑'], ['青', '青'], ['水', '水色'],
    ['紫', '紫'], ['茶', '茶'], ['黒', '黒'], ['白', '白']];
  // 柄（表記ゆれ → 正規名）。長いものから順に照合する
  const PATTERN_ALIASES = [['山形一文字', '山形一文字'], ['山形一本輪', '山形一本輪'], ['山形二本輪', '山形二本輪'], ['山形三本輪', '山形三本輪'],
    ['山形帯', '山形帯'], ['ひし山形', '菱山形'], ['菱山形', '菱山形'], ['のこぎり歯形', '鋸歯形'], ['鋸歯形', '鋸歯形'], ['山形', '山形一本輪'],
    ['十字たすき', '十字襷'], ['十字襷', '十字襷'], ['たすき', '襷'], ['襷', '襷'], ['一本輪', '一本輪'], ['二本輪', '二本輪'], ['三本輪', '三本輪'],
    ['一文字', '一文字'], ['帯', '帯'], ['縦じま', '縦縞'], ['縦縞', '縦縞'], ['格子じま', '格子'], ['格子縞', '格子'], ['格子', '格子'],
    ['元ろく', '元禄'], ['元禄', '元禄'], ['ダイヤモンド', 'ダイヤモンド'], ['うろこ', 'うろこ'], ['井げたかすり', '井桁絣'], ['井桁絣', '井桁絣'],
    ['玉あられ', '玉霰'], ['玉霰', '玉霰'], ['星散らし', '星散'], ['星散', '星散'], ['蛇目散らし', '蛇目散'], ['蛇目散', '蛇目散'],
    ['銭形散らし', '銭形散'], ['銭形散', '銭形散']];
  const COLOR_MAP = Object.fromEntries(COLOR_ALIASES);
  const PATTERN_MAP = Object.fromEntries(PATTERN_ALIASES);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const C = COLOR_ALIASES.map(a => esc(a[0])).join('|');
  const P = PATTERN_ALIASES.map(a => esc(a[0])).join('|');

  // 表記 → { body: {c, p}, sleeve: {c, p}, span }。読めない部分があれば null
  function parse(text) {
    const tokens = String(text).trim().split(/[、・，,]\s*/).filter(Boolean);
    if (!tokens.length) return null;
    const first = tokens[0].match(new RegExp(`^(?:胴)?(${C})$`));
    if (!first) return null;
    const silk = { body: { c: COLOR_MAP[first[1]], p: null }, sleeve: { c: null, p: null }, span: null };
    for (const t of tokens.slice(1)) {
      let m;
      if ((m = t.match(new RegExp(`^(${C})袖(?:(${C})(${P}))?$`)))) {            // 白袖 / 白袖赤一本輪
        silk.sleeve.c = COLOR_MAP[m[1]];
        if (m[2]) silk.sleeve.p = { t: PATTERN_MAP[m[3]], c: COLOR_MAP[m[2]] };
      } else if ((m = t.match(new RegExp(`^袖(${C})(${P})$`)))) {                  // 袖黄縦縞
        silk.sleeve.p = { t: PATTERN_MAP[m[2]], c: COLOR_MAP[m[1]] };
      } else if ((m = t.match(new RegExp(`^袖(${C})$`)))) {                         // 袖茶（＝茶袖）
        silk.sleeve.c = COLOR_MAP[m[1]];
      } else if ((m = t.match(new RegExp(`^(?:胴)?(${C})(${P})$`)))) {             // 赤十字襷 / 黄鋸歯形
        const p = { t: PATTERN_MAP[m[2]], c: COLOR_MAP[m[1]] };
        if (['鋸歯形', '一文字', '山形一文字'].includes(p.t)) silk.span = p;
        else if (!silk.body.p) silk.body.p = p;
        else return null;
      } else {
        return null;
      }
    }
    if (!silk.sleeve.c) silk.sleeve.c = silk.body.c;
    return silk;
  }

  // ---------- 形 ----------
  // viewBox 0 0 200 200。胴と左右の袖、立ち襟
  const BODY = 'M72 22 Q100 34 128 22 L150 36 L150 194 L50 194 L50 36 Z';
  const SLEEVE_L = 'M50 36 L36 42 Q22 50 19 74 L12 194 L44 194 L50 84 Z';
  const SLEEVE_R = 'M150 36 L164 42 Q178 50 181 74 L188 194 L156 194 L150 84 Z';
  const COLLAR = 'M78 14 Q100 24 122 14 L128 23 Q100 37 72 23 Z';
  const OUTLINE = '#2A2A2E';

  // 帯状の輪（縦位置の中心）
  const RING_Y = { '一本輪': [108], '二本輪': [94, 122], '三本輪': [82, 108, 134] };
  const BAND_H = 14;

  function zigzag(yc, x0, x1, period, amp) {
    const pts = [];
    for (let x = x0, up = true; x <= x1 + period; x += period / 2, up = !up) pts.push(`${x},${yc + (up ? -amp : amp)}`);
    return pts.join(' ');
  }

  // 柄を描く（クリップ領域の中に、色 col で描画）
  function patternShapes(t, col, area) {
    const f = `fill="${col}"`;
    const x0 = area === 'sleeve' ? 0 : 40, x1 = area === 'sleeve' ? 200 : 160;
    const s = [];
    if (RING_Y[t]) {
      for (const y of RING_Y[t]) s.push(`<rect x="0" y="${y - BAND_H / 2}" width="200" height="${BAND_H}" ${f}/>`);
    } else if (t === '帯') {
      s.push(`<rect x="0" y="166" width="200" height="20" ${f}/>`);
    } else if (/^山形/.test(t)) {
      const ys = t === '山形帯' ? [174] : t === '山形三本輪' ? [80, 108, 136] : t === '山形二本輪' ? [94, 124] : [108];
      for (const y of ys) s.push(`<polyline points="${zigzag(y, 0, 200, 34, 9)}" fill="none" stroke="${col}" stroke-width="12" stroke-linejoin="miter"/>`);
    } else if (t === '菱山形') {
      for (let x = 50; x <= 150; x += 25) s.push(`<polygon points="${x},88 ${x + 12.5},108 ${x},128 ${x - 12.5},108" ${f}/>`);
    } else if (t === '襷') {
      s.push(`<line x1="44" y1="28" x2="156" y2="200" stroke="${col}" stroke-width="20"/>`);
    } else if (t === '十字襷') {
      s.push(`<line x1="44" y1="28" x2="156" y2="200" stroke="${col}" stroke-width="18"/>`);
      s.push(`<line x1="156" y1="28" x2="44" y2="200" stroke="${col}" stroke-width="18"/>`);
    } else if (t === '縦縞') {
      for (let x = area === 'sleeve' ? 4 : 52; x < x1; x += 16) s.push(`<rect x="${x}" y="0" width="7" height="200" ${f}/>`);
    } else if (t === '格子') {
      for (let x = 46; x < 200; x += 20) s.push(`<rect x="${x}" y="0" width="5" height="200" ${f}/>`);
      for (let x = 46; x > 0; x -= 20) s.push(`<rect x="${x}" y="0" width="5" height="200" ${f}/>`);
      for (let y = 30; y < 200; y += 20) s.push(`<rect x="0" y="${y}" width="200" height="5" ${f}/>`);
    } else if (t === '元禄') {
      for (let y = 10, r = 0; y < 200; y += 20, r++) for (let x = (r % 2 ? 0 : 20) - 20; x < 200; x += 40) s.push(`<rect x="${x + 10}" y="${y}" width="20" height="20" ${f}/>`);
    } else if (t === 'ダイヤモンド') {
      for (let y = 10, r = 0; y < 220; y += 20, r++) for (let x = (r % 2 ? 12 : 0); x < 212; x += 24) s.push(`<polygon points="${x},${y - 20} ${x + 12},${y} ${x},${y + 20} ${x - 12},${y}" ${f}/>`);
    } else if (t === 'うろこ') {
      for (let y = 14, r = 0; y < 220; y += 22, r++) for (let x = (r % 2 ? 13 : 0); x < 220; x += 26) s.push(`<polygon points="${x},${y} ${x + 13},${y + 22} ${x - 13},${y + 22}" ${f}/>`);
    } else if (['玉霰', '星散', '蛇目散', '銭形散', '井桁絣'].includes(t)) {
      const pts = area === 'sleeve'
        ? [[28, 70], [26, 110], [24, 150], [172, 70], [174, 110], [176, 150]]
        : t === '井桁絣' ? [[76, 72], [124, 72], [100, 112], [76, 152], [124, 152]]
          : [[72, 60], [128, 60], [100, 88], [72, 116], [128, 116], [100, 144], [72, 172], [128, 172]];
      for (const [x, y] of pts) s.push(dot(t, x, y, col));
    }
    return s.join('');
  }

  function dot(t, x, y, col) {
    if (t === '玉霰') return `<circle cx="${x}" cy="${y}" r="6" fill="${col}"/>`;
    if (t === '蛇目散') return `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${col}" stroke-width="4"/>`;
    if (t === '銭形散') return `<circle cx="${x}" cy="${y}" r="8" fill="${col}"/><rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="var(--hole,#fff)" data-hole="1"/>`;
    if (t === '井桁絣') {
      return `<g fill="${col}"><rect x="${x - 7}" y="${y - 12}" width="4" height="24"/><rect x="${x + 3}" y="${y - 12}" width="4" height="24"/>`
        + `<rect x="${x - 12}" y="${y - 7}" width="24" height="4"/><rect x="${x - 12}" y="${y + 3}" width="24" height="4"/></g>`;
    }
    // 星
    const p = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 4 : 10, a = -Math.PI / 2 + (i * Math.PI) / 5;
      p.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${p.join(' ')}" fill="${col}"/>`;
  }

  let uid = 0;
  // 表記から SVG 文字列を作る
  function svg(text, opts = {}) {
    const silk = typeof text === 'string' ? parse(text) : text;
    const size = opts.size || 120;
    const label = opts.label || (typeof text === 'string' ? text : '');
    const id = `sk${++uid}`;
    const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="${label}">`;
    if (!silk) {
      return `${head}<path d="${BODY}" fill="#eee" stroke="${OUTLINE}" stroke-width="2"/><text x="100" y="118" font-size="40" text-anchor="middle" fill="#999">?</text></svg>`;
    }
    const col = c => COLORS[c] || '#ccc';
    const holeFix = (html, under) => html.replace(/fill="var\(--hole,#fff\)" data-hole="1"/g, `fill="${under}"`);
    let out = head
      + `<defs><clipPath id="${id}b"><path d="${BODY}"/></clipPath>`
      + `<clipPath id="${id}s"><path d="${SLEEVE_L}"/><path d="${SLEEVE_R}"/></clipPath>`
      + `<clipPath id="${id}a"><path d="${BODY}"/><path d="${SLEEVE_L}"/><path d="${SLEEVE_R}"/></clipPath></defs>`;
    // 袖
    out += `<path d="${SLEEVE_L}" fill="${col(silk.sleeve.c)}"/><path d="${SLEEVE_R}" fill="${col(silk.sleeve.c)}"/>`;
    if (silk.sleeve.p) out += `<g clip-path="url(#${id}s)">${holeFix(patternShapes(silk.sleeve.p.t, col(silk.sleeve.p.c), 'sleeve'), col(silk.sleeve.c))}</g>`;
    // 胴
    out += `<path d="${BODY}" fill="${col(silk.body.c)}"/>`;
    if (silk.body.p) out += `<g clip-path="url(#${id}b)">${holeFix(patternShapes(silk.body.p.t, col(silk.body.p.c), 'body'), col(silk.body.c))}</g>`;
    // 胴と袖にまたがる柄
    if (silk.span) {
      const c = col(silk.span.c);
      let shape = '';
      if (silk.span.t === '鋸歯形') {
        const teeth = [];
        for (let x = 0; x <= 200; x += 20) teeth.push(`${x},58`, `${x + 10},80`);
        shape = `<polygon points="0,0 200,0 200,58 ${teeth.join(' ')} 0,58" fill="${c}"/>`;
      } else if (silk.span.t === '一文字') {
        shape = `<rect x="0" y="${108 - BAND_H / 2}" width="200" height="${BAND_H}" fill="${c}"/>`;
      } else {
        shape = `<polyline points="${zigzag(108, 0, 200, 34, 9)}" fill="none" stroke="${c}" stroke-width="12"/>`;
      }
      out += `<g clip-path="url(#${id}a)">${shape}</g>`;
    }
    // 輪郭・襟・ボタン
    out += `<g fill="none" stroke="${OUTLINE}" stroke-width="2.2" stroke-linejoin="round">`
      + `<path d="${SLEEVE_L}"/><path d="${SLEEVE_R}"/><path d="${BODY}"/></g>`
      + `<path d="${COLLAR}" fill="${col(silk.body.c)}" stroke="${OUTLINE}" stroke-width="2.2" stroke-linejoin="round"/>`
      + [42, 54, 66].map(y => `<circle cx="100" cy="${y}" r="2.2" fill="none" stroke="${OUTLINE}" stroke-width="1.4"/>`).join('')
      + '</svg>';
    return out;
  }

  const api = { parse, svg, COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Silks = api;
})(typeof window !== 'undefined' ? window : globalThis);
