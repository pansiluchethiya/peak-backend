import type { FastifyInstance } from 'fastify';
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Peak Movies</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#050507; --bg2:#0c0c12; --card:#101018; --card2:#16161f;
  --border:#1e1e2a; --fg:#f4f4f8; --muted:#8a8aa0; --accent:#7c5cff; --accent2:#ff5c8a;
  --ok:#3dd68c; --warn:#ffb020;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--fg);font-family:'Inter',system-ui,sans-serif;min-height:100vh}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
header{position:sticky;top:0;z-index:50;background:rgba(5,5,7,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:24px}
header .logo{font-weight:800;font-size:20px;letter-spacing:-.5px;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
header nav{display:flex;gap:6px}
header nav button{background:transparent;color:var(--muted);border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500}
header nav button.active{color:var(--fg);background:var(--card)}
header .search{margin-left:auto;display:flex;gap:8px}
header input{background:var(--card);border:1px solid var(--border);color:var(--fg);padding:8px 14px;border-radius:8px;font-size:14px;width:260px}
header button.go{background:var(--accent);color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600}
main{max-width:1280px;margin:0 auto;padding:24px}
.hero{position:relative;border-radius:16px;overflow:hidden;margin-bottom:32px;background:var(--card);min-height:260px;display:flex;align-items:flex-end;padding:32px;background-size:cover;background-position:center}
.hero::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(5,5,7,.95) 100%)}
.hero > div{position:relative;z-index:1;max-width:600px}
.hero h2{font-size:32px;font-weight:800;margin-bottom:8px}
.hero p{color:var(--muted);margin-bottom:16px;line-height:1.5}
.hero button{background:var(--accent);color:#fff;border:0;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px}
.section{margin-bottom:32px}
.section h3{font-size:18px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:10px}
.section h3 span{color:var(--muted);font-size:13px;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;transition:transform .15s,border-color .15s}
.card:hover{transform:translateY(-4px);border-color:var(--accent)}
.card .poster{aspect-ratio:2/3;background:var(--card2);position:relative;overflow:hidden}
.card .poster img{width:100%;height:100%;object-fit:cover}
.card .poster .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px}
.card .meta{padding:10px}
.card .meta .t{font-size:13px;font-weight:600;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .meta .s{font-size:11px;color:var(--muted)}
.detail{display:grid;grid-template-columns:240px 1fr;gap:28px;margin-bottom:32px}
.detail .poster{border-radius:12px;overflow:hidden;background:var(--card);aspect-ratio:2/3}
.detail .poster img{width:100%;height:100%;object-fit:cover}
.detail h2{font-size:28px;font-weight:800;margin-bottom:6px}
.detail .meta{color:var(--muted);font-size:13px;margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap}
.detail .meta span{background:var(--card);padding:3px 8px;border-radius:4px;border:1px solid var(--border)}
.detail p{line-height:1.6;color:#c8c8d4;margin-bottom:20px}
.detail .actions{display:flex;gap:10px;flex-wrap:wrap}
.btn{background:var(--accent);color:#fff;border:0;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px}
.btn.ghost{background:var(--card);border:1px solid var(--border);color:var(--fg)}
.btn.danger{background:#2a1018;color:var(--accent2);border:1px solid #3a1a24}
.sources{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:24px}
.sources h4{font-size:14px;font-weight:600;margin-bottom:10px}
.src-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid transparent}
.src-row:hover{background:var(--card2);border-color:var(--border)}
.src-row .q{font-size:11px;font-weight:600;padding:2px 6px;border-radius:4px;background:var(--card2);color:var(--muted)}
.src-row .p{font-size:12px;color:var(--muted);margin-left:auto}
.player-modal{position:fixed;inset:0;background:rgba(0,0,0,.96);z-index:100;display:none;flex-direction:column}
.player-modal.open{display:flex}
.player-modal .bar{padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)}
.player-modal .bar span{font-weight:600}
.player-modal video,.player-modal iframe{flex:1;width:100%;background:#000;border:0}
.player-modal button{background:var(--card);color:var(--fg);border:1px solid var(--border);padding:8px 14px;border-radius:8px;cursor:pointer}
.channels-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.ch{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;cursor:pointer;display:flex;align-items:center;gap:12px}
.ch:hover{border-color:var(--accent)}
.ch .logo{width:40px;height:40px;border-radius:8px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--muted);overflow:hidden;flex-shrink:0}
.ch .logo img{width:100%;height:100%;object-fit:cover}
.ch .info .name{font-size:13px;font-weight:600}
.ch .info .group{font-size:11px;color:var(--muted)}
.groups{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.groups button{background:var(--card);color:var(--muted);border:1px solid var(--border);padding:6px 12px;border-radius:999px;cursor:pointer;font-size:12px}
.groups button.active{color:var(--fg);border-color:var(--accent);background:var(--card2)}
.empty{color:var(--muted);padding:40px;text-align:center}
.spinner{display:inline-block;width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:720px){.detail{grid-template-columns:1fr}.hero h2{font-size:22px}header .search input{width:140px}}
</style>
</head>
<body>
<header>
  <div class="logo">PEAK MOVIES</div>
  <nav>
    <button data-route="home" class="active">Home</button>
    <button data-route="movies">Movies</button>
    <button data-route="tv">TV Shows</button>
    <button data-route="live">Live TV</button>
  </nav>
  <div class="search">
    <input id="searchInput" placeholder="Search titles…" />
    <button class="go" id="searchBtn">Search</button>
  </div>
</header>
<main id="app"></main>
<div class="player-modal" id="playerModal">
  <div class="bar"><span id="playerTitle"></span><button id="closePlayer">✕ Close</button></div>
  <video id="playerVideo" controls autoplay playsinline></video>
  <iframe id="playerFrame" style="display:none;flex:1;border:0;"></iframe>
</div>
<script>
const API = location.origin + '/api/v1';
const app = document.getElementById('app');
let route = 'home';
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function api(path){ const r=await fetch(API+path); if(!r.ok) throw new Error(r.status+' '+await r.text()); return r.json(); }
function posterUrl(p){ if(!p) return ''; return 'https://image.tmdb.org/t/p/w342'+p; }
function openPlayer(title, src){
  const m=document.getElementById('playerModal');
  document.getElementById('playerTitle').textContent=title;
  const v=document.getElementById('playerVideo'), f=document.getElementById('playerFrame');
  if(src.type==='embed'){ v.style.display='none'; f.style.display='block'; f.src=src.url; }
  else { f.style.display='none'; v.style.display='block'; v.src=src.url; v.play().catch(()=>{}); }
  m.classList.add('open');
}
document.getElementById('closePlayer').onclick=()=>{
  const m=document.getElementById('playerModal'); m.classList.remove('open');
  const v=document.getElementById('playerVideo'); v.pause(); v.removeAttribute('src');
  const f=document.getElementById('playerFrame'); f.removeAttribute('src');
};
function card(m, type){
  const id = m.tmdbId || m.id;
  const title = m.title || m.name;
  const year = m.year || (m.release_date||'').slice(0,4) || (m.first_air_date||'').slice(0,4);
  const p = m.posterPath || m.poster_path;
  return '<div class="card" data-id="'+esc(id)+'" data-type="'+type+'">'+
    '<div class="poster">'+(p?'<img src="'+posterUrl(p)+'" loading="lazy" />':'<div class="ph">No image</div>')+'</div>'+
    '<div class="meta"><div class="t">'+esc(title)+'</div><div class="s">'+esc(year||'')+'</div></div></div>';
}
async function loadHome(){
  app.innerHTML = '<div class="hero" style="background-image:url(https://image.tmdb.org/t/p/original/5a4JdoFwjlKN34hlMPREoL9Ll1O.jpg)"><div><h2>Welcome to Peak Movies</h2><p>Stream movies, TV shows and live channels. Search anything above.</p><button onclick="document.querySelector(\'[data-route=movies]\').click()">Browse Movies</button></div></div>'+
    '<div class="section"><h3>Trending <span>popular right now</span></h3><div class="grid" id="trend"><div class="empty"><span class="spinner"></span></div></div></div>';
  try {
    const d = await api('/search?q=batman&type=movie');
    document.getElementById('trend').innerHTML = (d.results||[]).slice(0,12).map(m=>card(m,'movie')).join('') || '<div class="empty">No results</div>';
    bindCards();
  } catch(e){ document.getElementById('trend').innerHTML = '<div class="empty">'+esc(e.message)+'</div>'; }
}
async function loadSearch(q, type){
  app.innerHTML = '<div class="section"><h3>Results for "'+esc(q)+'"</h3><div class="grid" id="res"><div class="empty"><span class="spinner"></span></div></div></div>';
  try {
    const d = await api('/search?q='+encodeURIComponent(q)+'&type='+type);
    const items = d.results||[];
    document.getElementById('res').innerHTML = items.map(m=>card(m,type)).join('') || '<div class="empty">No results</div>';
    bindCards();
  } catch(e){ document.getElementById('res').innerHTML = '<div class="empty">'+esc(e.message)+'</div>'; }
}
async function loadDetail(id, type){
  app.innerHTML = '<div class="empty"><span class="spinner"></span> Loading…</div>';
  const peakId = id.startsWith('pm_') ? id : null;
  // get metadata via tmdb-style: we only have search; fetch title via meta if peak id
  let meta = { title: 'Loading…', year: null, posterPath: null, overview: '' };
  try {
    if(peakId){ const d = await api('/meta/'+(type==='movie'?'movie':'tv')+'?id='+encodeURIComponent(peakId)); meta = { ...meta, ...d.media }; }
  } catch(e){}
  // fallback title from search not available; use id
  app.innerHTML = '<div class="detail">'+
    '<div class="poster">'+(meta.posterPath||meta.poster_path?'<img src="'+posterUrl(meta.posterPath||meta.poster_path)+'" />':'<div class="ph" style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted)">No image</div>')+'</div>'+
    '<div>'+
      '<h2>'+esc(meta.title||meta.name||id)+'</h2>'+
      '<div class="meta"><span>'+esc(type)+'</span>'+(meta.year?'<span>'+esc(meta.year)+'</span>':'')+'</div>'+
      '<p>'+esc(meta.overview||meta.tagline||'')+'</p>'+
      '<div class="actions">'+
        '<button class="btn" id="playBtn">▶ Play</button>'+
        '<button class="btn ghost" id="metaBtn">Refresh metadata</button>'+
      '</div>'+
      '<div class="sources" id="srcBox" style="display:none;margin-top:20px;"><h4>Sources</h4><div id="srcList"></div></div>'+
    '</div></div>';
  document.getElementById('playBtn').onclick = async () => {
    try {
      setStatus2('Resolving…');
      const path = type==='movie' ? '/watch/movies?id='+encodeURIComponent(id) : '/watch/tv?id='+encodeURIComponent(id)+'&season=1&episode=1';
      // if id is raw tmdb, encode not needed (backend accepts raw)
      const d = await api(path);
      const box = document.getElementById('srcBox'); box.style.display='block';
      const list = document.getElementById('srcList');
      list.innerHTML = (d.sources||[]).map((s,i)=>'<div class="src-row" data-i="'+i+'"><span class="q">'+esc(s.quality)+'</span><span>'+esc(s.type)+'</span><span class="p">'+esc(s.provider||'')+'</span></div>').join('') || '<div class="empty">No sources</div>';
      list.querySelectorAll('.src-row').forEach((r,i)=> r.onclick = ()=> openPlayer(d.media.title||'title', d.sources[i]));
      if(d.sources && d.sources[0]) openPlayer(d.media.title||'title', d.sources[0]);
      setStatus2('Playing');
    } catch(e){ setStatus2('Error: '+e.message); }
  };
  document.getElementById('metaBtn').onclick = () => loadDetail(id,type);
}
function setStatus2(t){ const e=document.querySelector('.status'); if(e) e.textContent=t; }
function bindCards(){
  app.querySelectorAll('.card').forEach(c=>{
    c.onclick = () => {
      const id = c.dataset.id; const type = c.dataset.type;
      if(type==='movie' || type==='tv') loadDetail(id, type);
    };
  });
}
async function loadLive(group){
  app.innerHTML = '<div class="section"><h3>Live TV <span>channels</span></h3><div class="groups" id="groups"></div><div class="channels-grid" id="chans"><div class="empty"><span class="spinner"></span></div></div></div>';
  const d = await api('/live/tv/channels?limit=500');
  const groups = d.groups||[];
  const channels = d.channels||[];
  const gbox = document.getElementById('groups');
  let activeGroup = group || null;
  function renderGroups(){
    gbox.innerHTML = '<button class="'+(activeGroup===null?'active':'')+'" data-g="">All</button>' + groups.map(g=>'<button class="'+(activeGroup===g.id?'active':'')+'" data-g="'+esc(g.id)+'">'+esc(g.title)+' ('+g.count+')</button>').join('');
    gbox.querySelectorAll('button').forEach(b=> b.onclick = ()=>{ activeGroup = b.dataset.g || null; renderChannels(); renderGroups(); });
  }
  function renderChannels(){
    const filtered = activeGroup ? channels.filter(c=>c.group===activeGroup) : channels;
    const box = document.getElementById('chans');
    box.innerHTML = filtered.map(ch=>{
      const logo = ch.logo ? '<img src="'+esc(ch.logo)+'" />' : esc((ch.name||'').slice(0,3).toUpperCase());
      return '<div class="ch" data-id="'+esc(ch.id)+'"><div class="logo">'+logo+'</div><div class="info"><div class="name">'+esc(ch.name)+'</div><div class="group">'+esc(ch.group||'')+'</div></div></div>';
    }).join('') || '<div class="empty">No channels</div>';
    box.querySelectorAll('.ch').forEach(c=> c.onclick = async ()=>{
      try {
        setStatus2('Resolving…');
        const dd = await api('/watch/live/tv?id='+encodeURIComponent(c.dataset.id));
        const s = dd.sources && dd.sources[0];
        if(!s){ setStatus2('No source'); return; }
        openPlayer(dd.media.title || c.textContent, s);
        setStatus2('Playing');
      } catch(e){ setStatus2('Error: '+e.message); }
    });
  }
  renderGroups(); renderChannels();
}
function navigate(r){
  route = r;
  document.querySelectorAll('header nav button').forEach(b=> b.classList.toggle('active', b.dataset.route===r));
  if(r==='home') loadHome();
  else if(r==='movies') loadMovies();
  else if(r==='tv') loadTv();
  else if(r==='live') loadLive();
}
document.querySelectorAll('header nav button').forEach(b=> b.onclick = ()=> navigate(b.dataset.route));
document.getElementById('searchBtn').onclick = ()=>{
  const q = document.getElementById('searchInput').value.trim();
  if(!q) return;
  if(route==='tv') loadSearch(q,'tv'); else loadSearch(q,'movie');
};
document.getElementById('searchInput').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('searchBtn').click(); });
// initial
loadHome();
</script>
</body>
</html>`;
export async function previewAppRoutes(app: FastifyInstance): Promise<void> {
  app.get('/preview/app', async (_request, reply) => reply.type('text/html').send(HTML));
  app.get('/preview/app/', async (_request, reply) => reply.type('text/html').send(HTML));
}
