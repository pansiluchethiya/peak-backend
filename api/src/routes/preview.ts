import type { FastifyInstance } from 'fastify';

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Peak Movies — Preview</title>
<style>
  :root { --bg:#000; --fg:#f5f5f5; --muted:#888; --accent:#7c5cff; --card:#0a0a0a; --border:#1a1a1a; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--fg); font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; min-height:100vh; }
  header { padding:20px 24px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:16px; }
  header h1 { font-size:18px; letter-spacing:.5px; }
  nav button { background:transparent; color:var(--muted); border:1px solid var(--border); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px; }
  nav button.active { color:var(--fg); border-color:var(--accent); }
  main { padding:24px; max-width:1200px; margin:0 auto; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:12px; cursor:pointer; transition:border-color .15s; }
  .card:hover { border-color:var(--accent); }
  .card .title { font-size:13px; font-weight:600; margin-bottom:4px; }
  .card .sub { font-size:11px; color:var(--muted); }
  .player { position:fixed; inset:0; background:rgba(0,0,0,.95); display:none; flex-direction:column; z-index:10; }
  .player.open { display:flex; }
  .player .bar { padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); }
  .player video, .player iframe { flex:1; width:100%; background:#000; border:0; }
  .player button { background:var(--accent); color:#fff; border:0; padding:6px 12px; border-radius:6px; cursor:pointer; }
  .status { color:var(--muted); font-size:12px; margin:12px 0; }
  .row { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
  input { background:var(--card); border:1px solid var(--border); color:var(--fg); padding:8px 12px; border-radius:6px; font-size:13px; min-width:200px; }
  .channels .card { padding:8px; }
</style>
</head>
<body>
<header>
  <h1>PEAK MOVIES</h1>
  <nav>
    <button data-tab="movies" class="active">Movies</button>
    <button data-tab="tv">TV</button>
    <button data-tab="live">Live TV</button>
  </nav>
  <span class="status" id="status"></span>
</header>
<main>
  <div class="row">
    <input id="q" placeholder="Search (TMDB title)…" />
    <button id="searchBtn" style="background:var(--accent);color:#fff;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;">Search</button>
  </div>
  <div id="content"></div>
</main>
<div class="player" id="player">
  <div class="bar"><span id="playerTitle"></span><button id="closePlayer">Close</button></div>
  <video id="video" controls autoplay playsinline></video>
  <iframe id="iframe" style="display:none;flex:1;border:0;"></iframe>
</div>
<script>
const API = location.origin + '/api/v1';
const status = document.getElementById('status');
const content = document.getElementById('content');
let tab = 'movies';

function setStatus(t){ status.textContent = t; }

async function api(path){
  const r = await fetch(API + path);
  if(!r.ok) throw new Error(r.status + ' ' + await r.text());
  return r.json();
}

function showPlayer(title, source){
  const p = document.getElementById('player');
  const v = document.getElementById('video');
  const f = document.getElementById('iframe');
  document.getElementById('playerTitle').textContent = title;
  p.classList.add('open');
  if(source.type === 'embed'){ v.style.display='none'; f.style.display='block'; f.src = source.url; }
  else { f.style.display='none'; v.style.display='block'; v.src = source.url; v.play().catch(()=>{}); }
}

document.getElementById('closePlayer').onclick = () => {
  const p = document.getElementById('player');
  p.classList.remove('open');
  const v = document.getElementById('video'); v.pause(); v.removeAttribute('src');
  const f = document.getElementById('iframe'); f.removeAttribute('src');
};

async function loadMovies(q){
  setStatus('Loading…');
  let items = [];
  if(q){ const d = await api('/search?q=' + encodeURIComponent(q) + '&type=movie'); items = d.results || []; }
  else { items = [{tmdbId:'550',title:'Fight Club (demo)',year:1999},{tmdbId:'27205',title:'Inception (demo)',year:2010}]; }
  content.innerHTML = '<div class="grid">' + items.map(m => '<div class="card" data-id="' + (m.tmdbId||m.id) + '" data-type="movie"><div class="title">' + (m.title||m.name) + '</div><div class="sub">' + (m.year||'') + '</div></div>').join('') + '</div>';
  content.querySelectorAll('.card').forEach(c => c.onclick = async () => {
    try {
      setStatus('Resolving…');
      const d = await api('/watch/movies?id=' + encodeURIComponent(c.dataset.id));
      const s = d.sources && d.sources[0];
      if(!s){ setStatus('No source'); return; }
      showPlayer(d.media.title || c.textContent, s);
      setStatus('Playing');
    } catch(e){ setStatus('Error: ' + e.message); }
  });
  setStatus(items.length + ' items');
}

async function loadTv(q){
  setStatus('Loading…');
  let items = [];
  if(q){ const d = await api('/search?q=' + encodeURIComponent(q) + '&type=tv'); items = d.results || []; }
  else { items = [{tmdbId:'1396',title:'Breaking Bad (demo)',year:2008}]; }
  content.innerHTML = '<div class="grid">' + items.map(m => '<div class="card" data-id="' + (m.tmdbId||m.id) + '" data-type="tv"><div class="title">' + (m.title||m.name) + '</div><div class="sub">' + (m.year||'') + '</div></div>').join('') + '</div>';
  content.querySelectorAll('.card').forEach(c => c.onclick = async () => {
    const season = prompt('Season?', '1');
    const episode = prompt('Episode?', '1');
    if(!season || !episode) return;
    try {
      setStatus('Resolving…');
      const d = await api('/watch/tv?id=' + encodeURIComponent(c.dataset.id) + '&season=' + season + '&episode=' + episode);
      const s = d.sources && d.sources[0];
      if(!s){ setStatus('No source'); return; }
      showPlayer((d.media.title||'') + ' S' + season + 'E' + episode, s);
      setStatus('Playing');
    } catch(e){ setStatus('Error: ' + e.message); }
  });
  setStatus(items.length + ' items');
}

async function loadLive(){
  setStatus('Loading…');
  const d = await api('/live/tv/channels?limit=200');
  const groups = d.groups || [];
  const channels = d.channels || [];
  let html = '<div class="row">';
  groups.forEach(g => { html += '<button data-group="' + g.id + '" style="background:var(--card);color:var(--fg);border:1px solid var(--border);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">' + g.title + ' (' + g.count + ')</button>'; });
  html += '</div><div class="grid channels">';
  channels.forEach(ch => {
    html += '<div class="card" data-id="' + ch.id + '"><div class="title">' + ch.name + '</div><div class="sub">' + (ch.group||'') + '</div></div>';
  });
  html += '</div>';
  content.innerHTML = html;
  content.querySelectorAll('.card').forEach(c => c.onclick = async () => {
    try {
      setStatus('Resolving…');
      const dd = await api('/watch/live/tv?id=' + encodeURIComponent(c.dataset.id));
      const s = dd.sources && dd.sources[0];
      if(!s){ setStatus('No source'); return; }
      showPlayer(dd.media.title || c.textContent, s);
      setStatus('Playing');
    } catch(e){ setStatus('Error: ' + e.message); }
  });
  setStatus(channels.length + ' channels');
}

function render(){ if(tab==='movies') loadMovies(); else if(tab==='tv') loadTv(); else loadLive(); }

document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  tab = b.dataset.tab;
  render();
});
document.getElementById('searchBtn').onclick = () => {
  const q = document.getElementById('q').value.trim();
  if(tab==='movies') loadMovies(q);
  else if(tab==='tv') loadTv(q);
};

render();
</script>
</body>
</html>`;

export async function previewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/preview', async (_request, reply) => {
    return reply.type('text/html').send(HTML);
  });
  app.get('/preview/', async (_request, reply) => {
    return reply.type('text/html').send(HTML);
  });
}
