// Token Radar v4 — the dashboard. Reads window.RADAR (written by main.ts
// from the same board as board.json), renders the ranked board, a detail view
// per protocol with its fitted model and farm plan, the live-token set, and
// the per-category fits. No fetch, no network: everything is local data.
//
// URL parameters drive the three views the screenshots capture:
//   ?slug=<slug>        open that protocol's detail view
//   ?category=<name>    filter the board to one category
//   ?q=<text>           filter the board by name or slug
'use strict';

const R = window.RADAR;
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}
function pct(v) {
  if (v === null || v === undefined) return '<span class="flat">—</span>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const sign = v > 0 ? '+' : '';
  return '<span class="' + cls + '">' + sign + v.toFixed(1) + '%</span>';
}
function ageText(days) {
  if (days === null || days === undefined) return '—';
  if (days < 30) return days + 'd';
  if (days < 365) return Math.round(days / 30) + 'mo';
  return (days / 365).toFixed(1) + 'y';
}
function multText(r) {
  const src = r.multiple_source === 'category' ? 'cat' : r.multiple_source === 'universe' ? 'univ' : 'const';
  return r.multiple.toFixed(2) + '× <span class="slug">' + src + ' n=' + r.multiple_comps + '</span>';
}

const params = new URLSearchParams(location.search);
const state = {
  q: params.get('q') || '',
  cat: params.get('category') || '',
  status: 'pre',
  sort: 'implied',
  slug: params.get('slug') || null,
};

// ---- header, stats, fits -------------------------------------------------
$('meta').innerHTML =
  'Snapshot <b>' + esc(R.as_of) + '</b><br>' +
  'Watchlist floor <b>' + money(R.floor_usd) + '</b><br>' +
  'Model <b>' + esc(R.model_version) + '</b> · fitted per-category median';
const topRow = R.rows[0];
$('stats').innerHTML =
  '<div class="stat"><b>' + R.board_size + '</b><span>board rows</span></div>' +
  '<div class="stat"><b>' + R.watchlist_size + '</b><span>watchlist covered</span></div>' +
  '<div class="stat"><b>' + R.live_size + '</b><span>live-token shown</span></div>' +
  '<div class="stat"><b>' + money(topRow ? topRow.implied_value_usd : 0) + '</b><span>top implied value</span></div>';

const cats = [...new Set(R.rows.map((r) => r.category || 'Uncategorized'))].sort();
for (const c of cats) {
  const o = document.createElement('option');
  o.value = c; o.textContent = c;
  $('cat').appendChild(o);
}
$('fitrows').innerHTML = R.fits
  .filter((f) => f.category !== '*')
  .map((f) => '<tr><td>' + esc(f.category) + '</td><td class="num">' + f.multiple.toFixed(3) + '×</td><td class="num">' + f.comps + '</td><td>' + esc(f.source) + '</td></tr>')
  .join('');

// ---- board ----------------------------------------------------------------
function visibleRows() {
  let rows = R.rows;
  if (state.cat) rows = rows.filter((r) => (r.category || 'Uncategorized') === state.cat);
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
  }
  const key = state.sort;
  const val = (r) => key === 'tvl' ? r.tvl_usd : key === 'growth' ? (r.change_7d ?? -1e9) : key === 'age' ? (r.age_days ?? -1) : r.implied_value_usd;
  return [...rows].sort((a, b) => val(b) - val(a) || a.slug.localeCompare(b.slug));
}
function rowHtml(r) {
  return '<tr data-slug="' + esc(r.slug) + '"' + (state.slug === r.slug ? ' class="sel"' : '') + '>' +
    '<td class="num">' + r.rank + '</td>' +
    '<td><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + '</span></td>' +
    '<td>' + esc(r.category || '—') + '</td>' +
    '<td>' + esc(r.chains.slice(0, 2).join(', ') || '—') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
    '<td class="num">' + money(r.tvl_usd) + '</td>' +
    '<td class="num">' + pct(r.change_7d) + '</td>' +
    '<td class="num">' + ageText(r.age_days) + '</td>' +
    '<td class="num">' + multText(r) + '</td>' +
    '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
}
function renderBoard() {
  const rows = visibleRows();
  $('rows').innerHTML = rows.map(rowHtml).join('');
  $('count').textContent = rows.length + ' of ' + R.rows.length + ' rows';
  document.querySelectorAll('#rows tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.slug)));
}

// ---- live set --------------------------------------------------------------
function renderLive() {
  const show = state.status !== 'pre';
  $('livewrap').hidden = !show;
  if (!show) return;
  $('liverows').innerHTML = R.live.map((p) =>
    '<tr><td><span class="name">' + esc(p.name) + '</span><span class="slug">' + esc(p.slug) + '</span></td>' +
    '<td>' + esc(p.category || '—') + '</td>' +
    '<td>' + esc(p.chains.slice(0, 2).join(', ') || '—') + '</td>' +
    '<td class="num">' + money(p.tvl_usd) + '</td>' +
    '<td class="num">' + money(p.mcap_usd) + '</td>' +
    '<td class="num">' + pct(p.change_7d) + '</td>' +
    '<td class="num">' + (p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—') + '</td></tr>'
  ).join('');
}

// ---- detail ----------------------------------------------------------------
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.slug = slug;
  const d = $('detail');
  d.hidden = false;
  d.innerHTML =
    '<h2>#' + r.rank + ' ' + esc(r.name) + ' <span class="tag">pre-token</span> <span class="hint">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') + '</span></h2>' +
    '<p>Records no token: no market cap, no CoinGecko id, no symbol in the snapshot. Implied value ' + money(r.implied_value_usd) + ' if the record stayed as it is.</p>' +
    '<div class="grid">' +
    '<div class="cell"><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
    '<div class="cell"><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
    '<div class="cell"><span>7-day change</span><b>' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b></div>' +
    '<div class="cell"><span>Age</span><b>' + ageText(r.age_days) + '</b></div>' +
    '<div class="cell"><span>Fitted multiple</span><b>' + r.multiple.toFixed(3) + '×</b></div>' +
    '<div class="cell"><span>Multiple source</span><b>' + esc(r.multiple_source) + ' · n=' + r.multiple_comps + '</b></div>' +
    '<div class="cell"><span>Growth multiplier</span><b>' + r.growth_multiplier.toFixed(2) + '×</b></div>' +
    '<div class="cell"><span>Maturity multiplier</span><b>' + r.maturity_multiplier.toFixed(2) + '×</b></div>' +
    '</div>' +
    '<h3>Farm plan — how to farm it</h3><ol>' +
    r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') +
    '</ol>';
  document.querySelectorAll('#rows tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.slug === slug));
  d.scrollIntoView({ block: 'nearest' });
}

// ---- controls ---------------------------------------------------------------
$('q').value = state.q;
$('cat').value = state.cat;
$('q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
$('status').addEventListener('change', (e) => { state.status = e.target.value; renderLive(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
document.querySelectorAll('#board thead th').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k;
  state.sort = k === 'rank' || k === 'implied' ? 'implied' : k === 'name' || k === 'category' || k === 'chains' ? state.sort : k;
  $('sort').value = state.sort;
  renderBoard();
}));

renderBoard();
renderLive();
if (state.slug) openDetail(state.slug);
