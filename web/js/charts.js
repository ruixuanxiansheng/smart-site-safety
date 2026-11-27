function svgEl(tag, attrs = {}, content = '') {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<${tag} ${a}>${content}</${tag}>`;
}

function niceMax(v) {
  if (v <= 0) return 4;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return step * mag;
}

export function lineChart(opts) {
  const { labels, series, height = 230, area = false } = opts;
  const W = 640;
  const H = height;
  const pad = { l: 36, r: 14, t: 16, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const rows = 4;
  let grid = '';
  for (let i = 0; i <= rows; i++) {
    const y = pad.t + (ih / rows) * i;
    const val = Math.round(max - (max / rows) * i);
    grid += svgEl('line', {
      x1: pad.l, x2: W - pad.r, y1: y, y2: y,
      stroke: '#202a2b', 'stroke-width': 1,
    });
    grid += svgEl('text', {
      x: pad.l - 8, y: y + 3.5, 'text-anchor': 'end',
      fill: '#647a76', 'font-size': 10,
    }, val);
  }

  const step = iw / Math.max(1, labels.length - 1);
  const x = (i) => pad.l + step * i;
  const y = (v) => pad.t + ih - (v / max) * ih;

  let labelsHtml = '';
  const labelEvery = labels.length > 9 ? Math.ceil(labels.length / 8) : 1;
  labels.forEach((lb, i) => {
    if (i % labelEvery === 0 || i === labels.length - 1) {
      labelsHtml += svgEl('text', {
        x: x(i), y: H - 9, 'text-anchor': 'middle',
        fill: '#647a76', 'font-size': 10,
      }, lb);
    }
  });

  let shapes = '';
  series.forEach((s) => {
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    if (area && s.areaColor) {
      const bottom = y(0);
      const areaPath = `M${x(0)},${bottom} L${pts.replace(/ /g, ' L')} L${x(s.values.length - 1)},${bottom} Z`;
      shapes += svgEl('path', {
        d: areaPath, fill: s.areaColor, stroke: 'none',
      });
    }
    shapes += svgEl('polyline', {
      points: pts, fill: 'none', stroke: s.color,
      'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    });
    s.values.forEach((v, i) => {
      shapes += svgEl('circle', {
        cx: x(i), cy: y(v), r: 2.4, fill: s.color, stroke: '#0b0f10',
        'stroke-width': 1.2,
      }, svgEl('title', {}, `${labels[i]} · ${s.name} ${v}`));
    });
  });

  return `<svg class="chart" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    ${grid}${shapes}${labelsHtml}
  </svg>`;
}

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, start, end) {
  const [sx, sy] = polar(cx, cy, r, end);
  const [ex, ey] = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M${sx},${sy} A${r},${r} 0 ${large} 0 ${ex},${ey}`;
}

export function donutChart(data, opts = {}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const W = opts.width || 210;
  const H = opts.height || 210;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(cx, cy) - 16;
  const inner = r * 0.66;
  let angle = 0;
  let slices = '';
  data.forEach((d) => {
    const sweep = (d.value / total) * 360;
    const end = angle + sweep;
    const outer = arcPath(cx, cy, r, angle, end);
    const innerA = arcPath(cx, cy, inner, angle, end);
    slices += svgEl('path', {
      d: `${outer} L${polar(cx, cy, inner, end).join(',')} ${innerA} L${polar(cx, cy, inner, angle).join(',')} Z`,
      fill: d.color,
    }, svgEl('title', {}, `${d.name} ${d.value}`));
    angle = end;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
    ${slices}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="#e8f1ef" font-size="24" font-weight="680">${total}</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" fill="#647a76" font-size="10">${opts.centerLabel || '总数'}</text>
  </svg>`;
}

export function barChart(opts) {
  const { labels, values, color = '#2dd4bf', height = 230, unit = '' } = opts;
  const W = 640;
  const H = height;
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...values));
  const rows = 4;

  let grid = '';
  for (let i = 0; i <= rows; i++) {
    const y = pad.t + (ih / rows) * i;
    const val = Math.round(max - (max / rows) * i);
    grid += svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: '#202a2b', 'stroke-width': 1 });
    grid += svgEl('text', { x: pad.l - 8, y: y + 3.5, 'text-anchor': 'end', fill: '#647a76', 'font-size': 10 }, val);
  }

  const bw = Math.min(30, (iw / values.length) * 0.55);
  let bars = '';
  values.forEach((v, i) => {
    const bx = pad.l + (iw / values.length) * i + (iw / values.length - bw) / 2;
    const bh = (v / max) * ih;
    const by = pad.t + ih - bh;
    bars += svgEl('rect', {
      x: bx, y: by, width: bw, height: bh, rx: 3,
      fill: color, opacity: v === 0 ? 0.18 : 0.92,
    }, svgEl('title', {}, `${labels[i]} ${v}${unit}`));
    bars += svgEl('text', {
      x: bx + bw / 2, y: by - 5, 'text-anchor': 'middle',
      fill: '#9cb1ad', 'font-size': 10,
    }, v || '');
  });

  const labelEvery = labels.length > 9 ? Math.ceil(labels.length / 8) : 1;
  let labelsHtml = '';
  labels.forEach((lb, i) => {
    if (i % labelEvery === 0 || i === labels.length - 1) {
      labelsHtml += svgEl('text', {
        x: pad.l + (iw / values.length) * i + iw / values.length / 2,
        y: H - 9, 'text-anchor': 'middle', fill: '#647a76', 'font-size': 10,
      }, lb);
    }
  });

  return `<svg class="chart" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    ${grid}${bars}${labelsHtml}
  </svg>`;
}

export function hbarChart(items, opts = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const rows = items.map((it, idx) => {
    const pct = Math.round((it.value / max) * 100);
    const color = it.color || opts.color || '#2dd4bf';
    return `<div class="hbar">
      <span class="name">${it.name}</span>
      <div class="progress"><span style="width:${pct}%;background:${color}"></span></div>
      <span class="val">${it.value}</span>
    </div>`;
  }).join('');
  return `<div class="hbar-list">${rows}</div>`;
}

export function progressRing(pct, opts = {}) {
  const size = opts.size || 120;
  const stroke = opts.stroke || 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = opts.color || '#2dd4bf';
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#1a2223" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="#e8f1ef" font-size="22" font-weight="680">${pct}%</text>
  </svg>`;
}
