(async function () {
  const SUPABASE_URL = 'https://vqmdcyoldsosvonlagdv.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_Q5LoKBKG0YtgZivMORFTsQ_jXfF_0pB';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // 홈 화면 앱(스탠드얼론)으로 다시 열어도 로그인이 유지되도록
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'travel-log-auth',
    },
  });
  const THEME_KEY = 'travel-app-theme';
  let entries = [];
  let userId = null;
  let currentRegion = null;
  let currentCountryPicker = null;
  let pendingPhotoBlob = null;
  const PHOTO_BUCKET = 'trip-photos';

  let KR_MAP = [];
  let WORLD_MAP = [];
  let WORLD_OUTLINES = [];

  const [krRes, worldRes, outlineRes] = await Promise.all([
    fetch('data/kr-map.json'),
    fetch('data/world-map.json'),
    fetch('data/world-outlines.json')
  ]);
  if (!krRes.ok || !worldRes.ok || !outlineRes.ok) {
    throw new Error('지도 데이터를 불러오지 못했습니다. 로컬 서버로 열어 주세요.');
  }
  KR_MAP = await krRes.json();
  WORLD_MAP = await worldRes.json();
  WORLD_OUTLINES = await outlineRes.json();

  const WORLD_VB = { x:0, y:0, w:1000.0, h:397.2 };

  // Lookups for resolving a typed/typed-then-picked country or state to the
  // SAME regionId scheme the desktop map uses, so mobile and desktop entries
  // always refer to the identical region.
  const COUNTRY_TO_ID = {};        // Korean country name -> country-level regionId
  const SUBDIVIDED_STATES = {};    // Korean country name -> [{id, name(state only)}]
  const STATE_ID_TO_COUNTRY = {};  // state regionId -> Korean country name
  WORLD_MAP.forEach(r=>{
    if(r.kind === 'country'){
      COUNTRY_TO_ID[r.name] = r.id;
    }else if(r.kind === 'state'){
      STATE_ID_TO_COUNTRY[r.id] = r.country;
      if(!SUBDIVIDED_STATES[r.country]) SUBDIVIDED_STATES[r.country] = [];
      const stateOnly = r.name.includes('·') ? r.name.split('·')[0].trim() : r.name;
      SUBDIVIDED_STATES[r.country].push({ id:r.id, name:stateOnly });
    }
  });
  function chipCountryOf(e){
    if(STATE_ID_TO_COUNTRY[e.regionId]) return STATE_ID_TO_COUNTRY[e.regionId];
    if(e.regionName.includes('·')) return e.regionName.split('·').pop().trim();
    return e.regionName;
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatRange(e){
    if(e.endDate && e.endDate !== e.startDate) return `${e.startDate} ~ ${e.endDate}`;
    return e.startDate;
  }

  function entryCostTotal(e){
    if(!e.costs) return 0;
    return (e.costs.lodging||0) + (e.costs.transport||0) + (e.costs.food||0) + (e.costs.other||0);
  }
  function fmtWon(n){
    return Math.round(n).toLocaleString('ko-KR') + '원';
  }
  function daysOf(e){
    const s = new Date(e.startDate+'T00:00:00');
    const en = new Date((e.endDate||e.startDate)+'T00:00:00');
    return Math.max(1, Math.round((en-s)/86400000)+1);
  }

  function hexToHsl(hex){
    hex = hex.trim().replace('#','');
    if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
    const r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b = parseInt(hex.slice(4,6),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h=0, s=0; const l=(max+min)/2;
    const d = max-min;
    if(d!==0){
      s = d / (1 - Math.abs(2*l-1));
      switch(max){
        case r: h = 60*(((g-b)/d)%6); break;
        case g: h = 60*((b-r)/d + 2); break;
        case b: h = 60*((r-g)/d + 4); break;
      }
      if(h<0) h += 360;
    }
    return { h, s: s*100, l: l*100 };
  }
  function themeAccentHsl(){
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--teal').trim();
    try{ return hexToHsl(raw); }catch(e){ return { h:168, s:32, l:34 }; }
  }
  function updateMapTokens(){
    const { h } = themeAccentHsl();
    const root = document.documentElement.style;
    root.setProperty('--map-bg', `hsl(${h},22%,90%)`);
    root.setProperty('--map-card', `hsl(${h},12%,96%)`);
    root.setProperty('--map-rule', `hsl(${h},22%,74%)`);
    root.setProperty('--map-ink', `hsl(${h},25%,24%)`);
    root.setProperty('--map-ink-soft', `hsl(${h},15%,44%)`);
  }

  function colorForCount(count){
    const accent = themeAccentHsl();
    const capped = Math.min(count,10);
    const lightness = 84 - (capped-1)*6.2;
    const text = lightness < 55 ? '#ffffff' : 'var(--ink)';
    return { fill:`hsl(${accent.h},${Math.max(accent.s,18)}%,${lightness}%)`, text };
  }

  function regionInfo(scope, id){
    const visited = entries.filter(e=> e.scope===scope && e.regionId===id && e.status!=='planned').length;
    const planned = entries.filter(e=> e.scope===scope && e.regionId===id && e.status==='planned').length;
    if(visited>0) return { mode:'visited', fill: colorForCount(visited).fill };
    if(planned>0) return { mode:'planned' };
    return { mode:'none' };
  }

  function applyRegionStyle(pathEl, info){
    if(info.mode==='visited'){
      pathEl.style.fill = info.fill;
      pathEl.style.strokeDasharray = '';
    }else if(info.mode==='planned'){
      pathEl.style.fill = 'url(#hatch-planned)';
      pathEl.style.strokeDasharray = '2,1.5';
    }else{
      pathEl.style.fill = '';
      pathEl.style.strokeDasharray = '';
    }
  }

  // entries 테이블: 기록 하나당 한 행. 사진은 trip-photos Storage 버킷에 올리고
  // 공개 URL만 photo_url 컬럼에 저장합니다. 추가/삭제/변경은 그 행만 insert/delete/update.
  function rowToEntry(r){
    return {
      id: r.id,
      scope: r.scope,
      regionId: r.region_id,
      regionName: r.region_name,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date || r.start_date,
      companion: r.companion || '',
      place: r.place || '',
      note: r.note || '',
      costs: {
        lodging: r.cost_lodging || 0,
        transport: r.cost_transport || 0,
        food: r.cost_food || 0,
        other: r.cost_other || 0
      },
      photo: r.photo_url || null
    };
  }

  async function loadEntries(){
    try{
      if(!userId) throw new Error('로그인이 필요합니다.');
      const { data, error } = await sb
        .from('entries')
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: true });
      if(error) throw error;
      entries = (data || []).map(rowToEntry);
    }catch(e){
      console.error('기록을 불러오지 못했어요', e);
      entries = [];
    }
    refresh();
  }

  // 압축한 이미지(Blob)를 trip-photos 버킷에 올리고 공개 URL을 돌려줍니다.
  async function uploadPhoto(blob){
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if(error) throw error;
    const { data } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  function storagePathFromUrl(url){
    const marker = `/${PHOTO_BUCKET}/`;
    const i = url.indexOf(marker);
    return i === -1 ? null : url.slice(i + marker.length).split('?')[0];
  }
  async function deletePhoto(url){
    const path = storagePathFromUrl(url);
    if(!path) return;
    const { error } = await sb.storage.from(PHOTO_BUCKET).remove([path]);
    if(error) console.warn('사진 파일 삭제 실패(무시)', error);
  }

  // ---------- Domestic (municipality) map ----------
  function buildKrSvgOnce(){
    const svg = document.getElementById('kr-svg');
    if(svg.dataset.built) return;
    svg.innerHTML = KR_MAP.map(r=>{
      return `<g class="kr-region" tabindex="0" role="button" aria-label="${r.name}" data-id="${r.id}" data-name="${r.name}">
        <path d="${r.d}"><title>${r.name}</title></path>
      </g>`;
    }).join('');
    svg.querySelectorAll('.kr-region').forEach(g=>{
      g.addEventListener('click', ()=> openPanel('domestic', g.dataset.id, g.dataset.name));
      g.addEventListener('keydown', (ev)=>{
        if(ev.key==='Enter' || ev.key===' '){
          ev.preventDefault();
          openPanel('domestic', g.dataset.id, g.dataset.name);
        }
      });
    });
    svg.dataset.built = '1';
  }

  function renderDomesticMap(){
    buildKrSvgOnce();
    let visitedCount = 0;
    KR_MAP.forEach(r=>{
      const info = regionInfo('domestic', r.id);
      if(info.mode==='visited') visitedCount++;
      const g = document.querySelector(`#kr-svg .kr-region[data-id="${r.id}"]`);
      if(!g) return;
      applyRegionStyle(g.querySelector('path'), info);
    });
    document.getElementById('progress-domestic').textContent = `${visitedCount} / ${KR_MAP.length}곳 방문`;
  }

  // ---------- World desktop map (zoom & pan) ----------
  let worldVb = { ...WORLD_VB };
  let worldBuilt = false;

  function buildWorldSvgOnce(){
    const svg = document.getElementById('world-svg');
    if(worldBuilt) return;
    const regionsHtml = WORLD_MAP.map(r=>{
      return `<g class="world-region kind-${r.kind}" data-id="${r.id}" data-name="${r.name}">
        <path d="${r.d}"><title>${r.name}</title></path>
      </g>`;
    }).join('');
    const outlinesHtml = WORLD_OUTLINES.map(o=>{
      return `<path class="world-outline-path" d="${o.d}"></path>`;
    }).join('');
    svg.innerHTML = regionsHtml + outlinesHtml;

    let dragging = false, dragMoved = false, dragStart = null;

    function applyVb(){ svg.setAttribute('viewBox', `${worldVb.x} ${worldVb.y} ${worldVb.w} ${worldVb.h}`); }
    function clientToSvg(clientX, clientY){
      const rect = svg.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      return { x: worldVb.x + px*worldVb.w, y: worldVb.y + py*worldVb.h };
    }
    function zoomAt(pt, factor){
      let newW = worldVb.w * factor;
      let newH = worldVb.h * factor;
      newW = Math.max(WORLD_VB.w*0.03, Math.min(WORLD_VB.w, newW));
      newH = Math.max(WORLD_VB.h*0.03, Math.min(WORLD_VB.h, newH));
      const ratioW = newW/worldVb.w, ratioH = newH/worldVb.h;
      worldVb.x = pt.x - (pt.x-worldVb.x)*ratioW;
      worldVb.y = pt.y - (pt.y-worldVb.y)*ratioH;
      worldVb.w = newW; worldVb.h = newH;
      applyVb();
    }

    svg.addEventListener('wheel', (ev)=>{
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 0.88 : (1/0.88);
      zoomAt(clientToSvg(ev.clientX, ev.clientY), factor);
    }, {passive:false});

    svg.addEventListener('mousedown', (ev)=>{
      dragging = true; dragMoved = false;
      dragStart = { x:ev.clientX, y:ev.clientY, vbx:worldVb.x, vby:worldVb.y };
    });
    window.addEventListener('mousemove', (ev)=>{
      if(!dragging) return;
      const dx = ev.clientX - dragStart.x, dy = ev.clientY - dragStart.y;
      if(Math.abs(dx)>3 || Math.abs(dy)>3) dragMoved = true;
      const rect = svg.getBoundingClientRect();
      worldVb.x = dragStart.vbx - dx*(worldVb.w/rect.width);
      worldVb.y = dragStart.vby - dy*(worldVb.h/rect.height);
      applyVb();
    });
    window.addEventListener('mouseup', ()=>{ dragging = false; });

    svg.addEventListener('dblclick', (ev)=>{ zoomAt(clientToSvg(ev.clientX, ev.clientY), 0.5); });

    svg.querySelectorAll('.world-region').forEach(g=>{
      g.addEventListener('click', ()=>{
        if(dragMoved){ dragMoved = false; return; }
        openPanel('world', g.dataset.id, g.dataset.name);
      });
    });

    document.getElementById('zoom-in').addEventListener('click', ()=> zoomAt({x:worldVb.x+worldVb.w/2, y:worldVb.y+worldVb.h/2}, 0.8));
    document.getElementById('zoom-out').addEventListener('click', ()=> zoomAt({x:worldVb.x+worldVb.w/2, y:worldVb.y+worldVb.h/2}, 1.25));
    document.getElementById('zoom-reset').addEventListener('click', ()=> { worldVb = { ...WORLD_VB }; applyVb(); });

    applyVb();
    worldBuilt = true;
  }

  function renderWorldMap(){
    buildWorldSvgOnce();
    let visitedCount = 0;
    WORLD_MAP.forEach(r=>{
      const info = regionInfo('world', r.id);
      if(info.mode==='visited') visitedCount++;
      const g = document.querySelector(`#world-svg .world-region[data-id="${r.id}"]`);
      if(!g) return;
      applyRegionStyle(g.querySelector('path'), info);
    });
    document.getElementById('progress-world').textContent = `${visitedCount} / ${WORLD_MAP.length}곳 방문`;
  }

  // ---------- World mobile chips ----------
  function renderWorldChips(){
    const counts = {};
    entries.filter(e=>e.scope==='world').forEach(e=>{
      const key = chipCountryOf(e);
      if(!counts[key]) counts[key] = {name:key, visited:0, planned:0};
      if(e.status==='planned') counts[key].planned++; else counts[key].visited++;
    });
    const names = Object.keys(counts);
    const wrap = document.getElementById('country-chips');
    if(!names.length){
      wrap.innerHTML = '<p class="empty-inline">아직 추가한 나라가 없어요.</p>';
    }else{
      wrap.innerHTML = names.map(name=>{
        const c = counts[name];
        let style;
        if(c.visited>0){ const cc = colorForCount(c.visited); style = `background:${cc.fill};color:${cc.text};`; }
        else style = `background:repeating-linear-gradient(45deg,#FBF8F1,#FBF8F1 3px,#C08A3E 3px,#C08A3E 5px);color:var(--ink);`;
        return `<button type="button" class="chip" data-name="${escapeHtml(name)}" style="${style}">${escapeHtml(name)}</button>`;
      }).join('');
      wrap.querySelectorAll('.chip').forEach(btn=>{
        btn.addEventListener('click', ()=> startCountryFlow(btn.dataset.name));
      });
    }
  }

  document.getElementById('country-add-btn').addEventListener('click', addCountry);
  document.getElementById('country-input').addEventListener('keydown', (ev)=>{
    if(ev.key==='Enter'){ ev.preventDefault(); addCountry(); }
  });
  function addCountry(){
    const input = document.getElementById('country-input');
    const val = input.value.trim();
    if(!val) return;
    startCountryFlow(val);
    input.value = '';
  }

  // A country name (typed, or from a mobile chip) resolves to either:
  // - a state picker (if that country has subdivided regions), or
  // - a direct panel open on the matching country-level regionId, or
  // - a best-effort fallback for names we don't recognize at all.
  function startCountryFlow(countryNameKo){
    if(SUBDIVIDED_STATES[countryNameKo]){
      openStatePicker(countryNameKo);
    }else if(COUNTRY_TO_ID[countryNameKo]){
      openPanel('world', COUNTRY_TO_ID[countryNameKo], countryNameKo);
    }else{
      openPanel('world', countryNameKo.toLowerCase(), countryNameKo);
    }
  }

  function openStatePicker(countryNameKo){
    currentRegion = null;
    currentCountryPicker = countryNameKo;
    document.getElementById('panel-region-name').textContent = countryNameKo;
    document.getElementById('region-panel').hidden = false;
    document.getElementById('panel-form').hidden = true;
    document.getElementById('panel-state-picker').hidden = false;
    renderPanelEntriesForCountry(countryNameKo);

    const states = SUBDIVIDED_STATES[countryNameKo];
    const sel = document.getElementById('panel-state-select');
    sel.innerHTML = '<option value="">지역 선택…</option>' +
      states.map(s=> `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const recent = entries.filter(e=> e.scope==='world' && chipCountryOf(e)===countryNameKo)
                           .sort((a,b)=> b.startDate.localeCompare(a.startDate))[0];
    if(recent) sel.value = recent.regionId;

    document.getElementById('panel-state-confirm').onclick = ()=>{
      const id = sel.value;
      if(!id) return;
      const stateOnly = sel.options[sel.selectedIndex].textContent;
      openPanel('world', id, `${stateOnly} · ${countryNameKo}`);
    };
  }

  function renderPanelEntriesForCountry(countryNameKo){
    const list = entries.filter(e=> e.scope==='world' && chipCountryOf(e)===countryNameKo)
                         .sort((a,b)=> a.startDate.localeCompare(b.startDate));
    const ul = document.getElementById('panel-entries');
    if(!list.length){
      ul.innerHTML = '<li class="panel-empty">아직 기록이 없어요.</li>';
      return;
    }
    ul.innerHTML = list.map(e=>{
      const bits = [];
      const stateLabel = e.regionName.includes('·') ? e.regionName.split('·')[0].trim() : e.regionName;
      bits.push(escapeHtml(stateLabel));
      if(e.companion) bits.push('동행 ' + escapeHtml(e.companion));
      if(e.place) bits.push(escapeHtml(e.place));
      if(e.status==='planned') bits.push('예정');
      const cost = entryCostTotal(e);
      if(cost>0) bits.push(`<span class="pe-cost">${fmtWon(cost)}</span>`);
      return `
        <li class="panel-entry">
          <span class="pe-date">${formatRange(e)}</span>
          <span class="pe-text">${bits.join(' · ')}</span>
          <button type="button" class="pe-remove" data-id="${e.id}">삭제</button>
        </li>
      `;
    }).join('');
    ul.querySelectorAll('.pe-remove').forEach(btn=>{
      btn.addEventListener('click', ()=> removeEntry(btn.dataset.id));
    });
  }

  // ---------- Photo handling ----------
  function readAndCompressImage(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>{
        const img = new Image();
        img.onload = ()=>{
          const maxW = 480;
          const scale = Math.min(1, maxW/img.width);
          const w = Math.max(1, Math.round(img.width*scale));
          const h = Math.max(1, Math.round(img.height*scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img,0,0,w,h);
          canvas.toBlob(
            (blob)=> blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했어요.')),
            'image/jpeg', 0.65
          );
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  document.getElementById('panel-photo').addEventListener('change', async (ev)=>{
    const file = ev.target.files[0];
    const preview = document.getElementById('photo-preview');
    if(preview.dataset.objurl){ URL.revokeObjectURL(preview.dataset.objurl); delete preview.dataset.objurl; }
    if(!file){ pendingPhotoBlob = null; preview.hidden = true; return; }
    try{
      pendingPhotoBlob = await readAndCompressImage(file);
      const objUrl = URL.createObjectURL(pendingPhotoBlob);
      preview.dataset.objurl = objUrl;
      preview.src = objUrl; preview.hidden = false;
    }catch(err){ console.error(err); pendingPhotoBlob = null; }
  });

  // ---------- Shared panel ----------
  function openPanel(scope, id, name){
    currentRegion = {scope, id, name};
    currentCountryPicker = null;
    document.getElementById('panel-region-name').textContent = name;
    document.getElementById('panel-form').reset();
    document.getElementById('panel-form').hidden = false;
    document.getElementById('panel-state-picker').hidden = true;
    pendingPhotoBlob = null;
    const preview = document.getElementById('photo-preview');
    if(preview.dataset.objurl){ URL.revokeObjectURL(preview.dataset.objurl); delete preview.dataset.objurl; }
    preview.hidden = true;
    document.getElementById('region-panel').hidden = false;
    renderPanelEntries();
    document.getElementById('panel-start').focus();
  }
  function closePanel(){
    currentRegion = null;
    currentCountryPicker = null;
    document.getElementById('region-panel').hidden = true;
    document.getElementById('panel-state-picker').hidden = true;
    document.getElementById('panel-form').hidden = false;
  }
  function renderPanelEntries(){
    if(!currentRegion) return;
    const list = entries.filter(e=>e.scope===currentRegion.scope && e.regionId===currentRegion.id)
                         .sort((a,b)=> a.startDate.localeCompare(b.startDate));
    const ul = document.getElementById('panel-entries');
    if(!list.length){
      ul.innerHTML = '<li class="panel-empty">아직 기록이 없어요.</li>';
      return;
    }
    ul.innerHTML = list.map(e=>{
      const bits = [];
      if(e.companion) bits.push('동행 ' + escapeHtml(e.companion));
      if(e.place) bits.push(escapeHtml(e.place));
      if(e.note) bits.push(escapeHtml(e.note));
      if(e.status==='planned') bits.push('예정');
      const cost = entryCostTotal(e);
      if(cost>0) bits.push(`<span class="pe-cost">${fmtWon(cost)}</span>`);
      return `
        <li class="panel-entry">
          <span class="pe-date">${formatRange(e)}</span>
          <span class="pe-text">${bits.join(' · ')}</span>
          ${e.photo ? `<img class="pe-thumb" src="${e.photo}" alt="">` : ''}
          <button type="button" class="pe-remove" data-id="${e.id}">삭제</button>
        </li>
      `;
    }).join('');
    ul.querySelectorAll('.pe-remove').forEach(btn=>{
      btn.addEventListener('click', ()=> removeEntry(btn.dataset.id));
    });
  }

  function renderTimeline(){
    const wrap = document.getElementById('timeline-list');
    if(!entries.length){
      wrap.innerHTML = '<p class="empty">아직 기록이 없어요.</p>';
      return;
    }
    const sorted = [...entries].sort((a,b)=> a.startDate.localeCompare(b.startDate));
    wrap.innerHTML = sorted.map(e=> timelineItemHtml(e, false)).join('');
    wrap.querySelectorAll('.tl-remove').forEach(btn=> btn.addEventListener('click', ()=> removeEntry(btn.dataset.id)));
    wrap.querySelectorAll('.tl-visit-btn').forEach(btn=> btn.addEventListener('click', ()=> markVisited(btn.dataset.id)));
  }

  function renderPlan(){
    const wrap = document.getElementById('plan-list');
    const planned = entries.filter(e=>e.status==='planned').sort((a,b)=> a.startDate.localeCompare(b.startDate));
    if(!planned.length){
      wrap.innerHTML = '<p class="empty">아직 계획이 없어요.</p>';
      return;
    }
    wrap.innerHTML = planned.map(e=> timelineItemHtml(e, true)).join('');
    wrap.querySelectorAll('.tl-remove').forEach(btn=> btn.addEventListener('click', ()=> removeEntry(btn.dataset.id)));
    wrap.querySelectorAll('.tl-visit-btn').forEach(btn=> btn.addEventListener('click', ()=> markVisited(btn.dataset.id)));
  }

  function timelineItemHtml(e, showVisitAction){
    const scopeLabel = e.scope==='domestic' ? '국내' : '해외';
    const statusLabel = e.status==='planned' ? '예정' : '다녀옴';
    return `
      <div class="tl-item">
        <div class="tl-date">${formatRange(e)}</div>
        <div class="tl-dot-col"><span class="tl-dot ${e.status==='planned'?'planned':''}"></span></div>
        <div class="tl-content">
          <div class="tl-region">${e.regionName}<span class="tl-scope">${scopeLabel}</span><span class="tl-status">${statusLabel}</span></div>
          ${e.companion ? `<div class="tl-companion">동행 ${escapeHtml(e.companion)}</div>` : ''}
          ${e.place ? `<div class="tl-place">${escapeHtml(e.place)}</div>` : ''}
          ${e.note ? `<div class="tl-note">${escapeHtml(e.note)}</div>` : ''}
          ${entryCostTotal(e)>0 ? `<div class="tl-cost">${fmtWon(entryCostTotal(e))}</div>` : ''}
          ${e.photo ? `<img class="tl-photo" src="${e.photo}" alt="">` : ''}
          <div class="tl-actions">
            ${(showVisitAction || e.status==='planned') ? `<button type="button" class="tl-visit-btn" data-id="${e.id}">다녀왔어요로 변경</button>` : ''}
            <button type="button" class="tl-remove" data-id="${e.id}">삭제</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Analytics ----------
  function topEntries(obj, n){
    return Object.entries(obj).sort((a,b)=> b[1]-a[1]).slice(0,n);
  }
  function barListHtml(pairs, maxVal, unit){
    if(!pairs.length) return '<p class="empty-inline">아직 데이터가 없어요.</p>';
    return pairs.map(([name,count])=>{
      const pct = Math.max(4, Math.round((count/maxVal)*100));
      return `
        <div class="stat-bar-row">
          <span class="stat-bar-label">${escapeHtml(name)}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
          <span class="stat-bar-value">${count}${unit||''}</span>
        </div>
      `;
    }).join('');
  }
  function computeStats(){
    const visited = entries.filter(e=> e.status!=='planned');
    const planned = entries.filter(e=> e.status==='planned');
    const totalDays = visited.reduce((sum,e)=> sum + daysOf(e), 0);
    const domesticSet = new Set(visited.filter(e=>e.scope==='domestic').map(e=>e.regionId));
    const worldSet = new Set(visited.filter(e=>e.scope==='world').map(e=>e.regionId));

    const companionCounts = {};
    visited.forEach(e=>{
      if(!e.companion) return;
      e.companion.split(/[,、\/·]+/).map(s=>s.trim()).filter(Boolean).forEach(name=>{
        companionCounts[name] = (companionCounts[name]||0) + 1;
      });
    });

    const countryCounts = {};
    visited.filter(e=>e.scope==='world').forEach(e=>{
      let c = e.regionName;
      if(c.includes('·')) c = c.split('·').pop().trim();
      countryCounts[c] = (countryCounts[c]||0) + 1;
    });

    const cat = {lodging:0, transport:0, food:0, other:0};
    visited.forEach(e=>{
      if(e.costs){
        cat.lodging += e.costs.lodging||0;
        cat.transport += e.costs.transport||0;
        cat.food += e.costs.food||0;
        cat.other += e.costs.other||0;
      }
    });
    const totalCost = cat.lodging + cat.transport + cat.food + cat.other;

    const sortedAsc = [...visited].sort((a,b)=> a.startDate.localeCompare(b.startDate));
    const mostRecent = sortedAsc[sortedAsc.length-1];
    const todayStr = new Date().toISOString().slice(0,10);
    const upcoming = [...planned].filter(e=> e.startDate >= todayStr).sort((a,b)=> a.startDate.localeCompare(b.startDate))[0];

    return {
      tripCount: visited.length, plannedCount: planned.length,
      domesticCount: domesticSet.size, worldCount: worldSet.size, totalDays,
      companionCounts, countryCounts, totalCost, cat,
      avgPerTrip: visited.length ? totalCost/visited.length : 0,
      avgPerDay: totalDays ? totalCost/totalDays : 0,
      mostRecent, upcoming
    };
  }

  function renderAnalytics(){
    const s = computeStats();
    const wrap = document.getElementById('analytics-content');
    const companionTop = topEntries(s.companionCounts, 5);
    const companionMax = companionTop.length ? companionTop[0][1] : 1;
    const countryTop = topEntries(s.countryCounts, 5);
    const countryMax = countryTop.length ? countryTop[0][1] : 1;

    const catLabels = {lodging:'숙박', transport:'교통', food:'식비', other:'기타'};
    const catColors = {lodging:'var(--teal)', transport:'var(--mustard)', food:'#8A9A6B', other:'var(--ink-soft)'};
    let acc = 0;
    const gradParts = [];
    const denom = s.totalCost || 1;
    Object.keys(catLabels).forEach(k=>{
      const frac = s.cat[k] / denom;
      gradParts.push(`${catColors[k]} ${acc*360}deg ${(acc+frac)*360}deg`);
      acc += frac;
    });
    const donutStyle = s.totalCost > 0 ? `background:conic-gradient(${gradParts.join(',')});` : `background:var(--rule);`;

    wrap.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><div class="stat-num">${s.tripCount}</div><div class="stat-label">다녀온 여행</div></div>
        <div class="stat-card"><div class="stat-num">${s.domesticCount}</div><div class="stat-label">국내 지역</div></div>
        <div class="stat-card"><div class="stat-num">${s.worldCount}</div><div class="stat-label">해외 지역</div></div>
        <div class="stat-card"><div class="stat-num">${s.totalDays}</div><div class="stat-label">총 여행일수</div></div>
      </div>
      <section class="stat-section">
        <h3>누구와 많이 갔을까</h3>
        ${barListHtml(companionTop, companionMax, '회')}
      </section>
      <section class="stat-section">
        <h3>어느 나라를 많이 갔을까</h3>
        ${barListHtml(countryTop, countryMax, '회')}
      </section>
      <section class="stat-section">
        <h3>여행 비용</h3>
        ${s.totalCost > 0 ? `
          <div class="cost-summary">
            <div class="cost-donut" style="${donutStyle}"></div>
            <div class="cost-legend">
              ${Object.keys(catLabels).map(k=> `<div class="legend-row"><span class="legend-dot" style="background:${catColors[k]}"></span>${catLabels[k]} · ${fmtWon(s.cat[k])}</div>`).join('')}
            </div>
          </div>
          <div class="cost-figures">
            <div><span class="cf-label">총 지출</span><span class="cf-value">${fmtWon(s.totalCost)}</span></div>
            <div><span class="cf-label">여행당 평균</span><span class="cf-value">${fmtWon(s.avgPerTrip)}</span></div>
            <div><span class="cf-label">1일 평균</span><span class="cf-value">${fmtWon(s.avgPerDay)}</span></div>
          </div>
        ` : '<p class="empty-inline">아직 입력된 비용이 없어요. 기록 추가할 때 비용을 넣어보세요.</p>'}
      </section>
      <section class="stat-section">
        <h3>기타</h3>
        <div class="misc-stats">
          <div>계획 중인 여행 <b>${s.plannedCount}건</b></div>
          ${s.mostRecent ? `<div>가장 최근 여행 <b>${escapeHtml(s.mostRecent.regionName)}</b> (${formatRange(s.mostRecent)})</div>` : ''}
          ${s.upcoming ? `<div>다음 예정 여행 <b>${escapeHtml(s.upcoming.regionName)}</b> (${formatRange(s.upcoming)})</div>` : ''}
        </div>
      </section>
    `;
  }

  function refresh(){
    renderDomesticMap();
    renderWorldMap();
    renderWorldChips();
    renderTimeline();
    renderPlan();
    renderAnalytics();
    if(currentRegion) renderPanelEntries();
    if(currentCountryPicker) renderPanelEntriesForCountry(currentCountryPicker);
  }

  async function removeEntry(id){
    const target = entries.find(e=> e.id===id);
    try{
      const { error } = await sb.from('entries').delete().eq('id', id);
      if(error) throw error;
      if(target && target.photo) await deletePhoto(target.photo);
      entries = entries.filter(e=> e.id!==id);
      refresh();
    }catch(err){
      console.error('삭제 실패', err);
      alert('삭제하지 못했어요: ' + err.message);
    }
  }
  async function markVisited(id){
    const e = entries.find(x=>x.id===id);
    if(!e) return;
    try{
      const { error } = await sb.from('entries').update({ status: 'visited' }).eq('id', id);
      if(error) throw error;
      e.status = 'visited';
      refresh();
    }catch(err){
      console.error('변경 실패', err);
      alert('변경하지 못했어요: ' + err.message);
    }
  }

  document.getElementById('panel-form').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    if(!currentRegion) return;
    const status = document.querySelector('input[name="panel-status"]:checked').value;
    const startDate = document.getElementById('panel-start').value;
    const endDateRaw = document.getElementById('panel-end').value;
    const companion = document.getElementById('panel-companion').value.trim();
    const place = document.getElementById('panel-place').value.trim();
    const note = document.getElementById('panel-note').value.trim();
    const costs = {
      lodging: Number(document.getElementById('panel-cost-lodging').value) || 0,
      transport: Number(document.getElementById('panel-cost-transport').value) || 0,
      food: Number(document.getElementById('panel-cost-food').value) || 0,
      other: Number(document.getElementById('panel-cost-other').value) || 0
    };
    if(!startDate) return;

    const submitBtn = ev.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try{
      let photoUrl = null;
      if(pendingPhotoBlob) photoUrl = await uploadPhoto(pendingPhotoBlob);

      const row = {
        user_id: userId,
        scope: currentRegion.scope,
        region_id: currentRegion.id,
        region_name: currentRegion.name,
        status,
        start_date: startDate,
        end_date: (endDateRaw && endDateRaw !== startDate) ? endDateRaw : null,
        companion: companion || null,
        place: place || null,
        note: note || null,
        cost_lodging: costs.lodging,
        cost_transport: costs.transport,
        cost_food: costs.food,
        cost_other: costs.other,
        photo_url: photoUrl
      };
      const { data, error } = await sb.from('entries').insert(row).select().single();
      if(error) throw error;

      entries.push(rowToEntry(data));
      ev.target.reset();
      pendingPhotoBlob = null;
      const preview = document.getElementById('photo-preview');
      if(preview.dataset.objurl){ URL.revokeObjectURL(preview.dataset.objurl); delete preview.dataset.objurl; }
      preview.hidden = true;
      refresh();
    }catch(err){
      console.error('기록 저장 실패', err);
      alert('기록을 저장하지 못했어요: ' + err.message);
    }finally{
      submitBtn.disabled = false;
    }
  });

  document.getElementById('panel-close').addEventListener('click', closePanel);

  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const view = btn.dataset.view;
      document.getElementById('view-map').hidden = view !== 'map';
      document.getElementById('view-timeline').hidden = view !== 'timeline';
      document.getElementById('view-plan').hidden = view !== 'plan';
      document.getElementById('view-analytics').hidden = view !== 'analytics';
      document.querySelectorAll('.tab-btn').forEach(b=> b.classList.toggle('active', b===btn));
      if(view === 'analytics') renderAnalytics();
    });
  });

  // ---------- Theme picker ----------
  document.getElementById('theme-btn').addEventListener('click', ()=>{
    document.getElementById('theme-popover').hidden = !document.getElementById('theme-popover').hidden;
  });
  function applyTheme(name){
    document.documentElement.setAttribute('data-theme', name);
    updateMapTokens();
    document.querySelectorAll('.theme-swatch').forEach(b=> b.classList.toggle('active', b.dataset.theme===name));
    renderDomesticMap();
    renderWorldMap();
    renderWorldChips();
  }
  document.querySelectorAll('.theme-swatch').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      applyTheme(btn.dataset.theme);
      document.getElementById('theme-popover').hidden = true;
      try{ localStorage.setItem(THEME_KEY, btn.dataset.theme); }catch(e){}
    });
  });
  function loadTheme(){
    try{
      const v = localStorage.getItem(THEME_KEY);
      if(v){ applyTheme(v); return; }
    }catch(e){ /* no saved theme yet */ }
    updateMapTokens();
  }
  loadTheme();
  document.getElementById('plan-go-map-btn').addEventListener('click', ()=>{
    document.querySelector('.tab-btn[data-view="map"]').click();
  });

  document.querySelectorAll('.subtab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const scope = btn.dataset.scope;
      document.getElementById('map-domestic').hidden = scope !== 'domestic';
      document.getElementById('map-world').hidden = scope !== 'world';
      document.getElementById('progress-domestic').hidden = scope !== 'domestic';
      document.getElementById('progress-world').hidden = scope !== 'world';
      document.querySelectorAll('.subtab-btn').forEach(b=> b.classList.toggle('active', b===btn));
      document.getElementById('map-caption').textContent = scope === 'domestic'
        ? '시/군/구 경계까지 살린 지도예요. 다녀올수록 10단계로 짙어지고, 계획만 있으면 빗금으로 표시돼요.'
        : '데스크톱은 지도를 확대·이동해서 클릭, 모바일은 나라 이름을 입력해서 추가해요. 일본·동남아·유럽 등 46개국은 주/도/현 단위예요.';
      closePanel();
    });
  });

  // ---------- Auth (이메일 8자리 코드) ----------
  const authScreen = document.getElementById('auth-screen');
  const appEl = document.querySelector('.app');
  const authForm = document.getElementById('auth-form');
  const authCodeForm = document.getElementById('auth-code-form');
  const authMsg = document.getElementById('auth-msg');
  const emailInput = document.getElementById('auth-email');
  const codeInput = document.getElementById('auth-code');
  let pendingEmail = null;
  let appInited = false;

  function showMsg(text, isError){
    authMsg.hidden = false;
    authMsg.classList.toggle('error', !!isError);
    authMsg.textContent = text;
  }
  function showEmailStep(){
    pendingEmail = null;
    authCodeForm.hidden = true;
    authForm.hidden = false;
    authMsg.hidden = true;
  }
  function showCodeStep(email){
    pendingEmail = email;
    authForm.hidden = true;
    authCodeForm.hidden = false;
    codeInput.value = '';
    codeInput.focus();
  }

  async function enterApp(session){
    userId = session.user.id;
    authScreen.hidden = true;
    appEl.hidden = false;
    document.getElementById('user-email').textContent = session.user.email || '';
    if(!appInited){
      appInited = true;
      await loadEntries();
    }
  }
  function exitApp(){
    appInited = false;
    userId = null;
    entries = [];
    appEl.hidden = true;
    authScreen.hidden = false;
    showEmailStep();
  }

  authForm.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const email = emailInput.value.trim();
    if(!email) return;
    const btn = document.getElementById('auth-submit');
    btn.disabled = true;
    showMsg('보내는 중…');
    // emailRedirectTo를 넘기지 않으면 매직링크 대신 코드가 메일로 전송된다.
    const { error } = await sb.auth.signInWithOtp({ email });
    btn.disabled = false;
    if(error){
      showMsg('보내지 못했어요: ' + error.message, true);
    }else{
      showCodeStep(email);
      showMsg(email + ' 로 8자리 코드를 보냈어요. 메일함을 확인하세요.');
    }
  });

  document.getElementById('auth-back').addEventListener('click', showEmailStep);

  authCodeForm.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const token = codeInput.value.trim();
    if(!pendingEmail || token.length < 8) return;
    const btn = document.getElementById('auth-verify');
    btn.disabled = true;
    showMsg('확인 중…');
    const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
    btn.disabled = false;
    if(error){
      showMsg('코드가 올바르지 않아요: ' + error.message, true);
    }
    // 성공하면 onAuthStateChange(SIGNED_IN)가 enterApp을 호출한다.
  });

  document.getElementById('logout-btn').addEventListener('click', ()=> sb.auth.signOut());

  // 앱이 뜨자마자 저장된 세션이 있는지 먼저 확인한다.
  // 세션이 있으면 로그인 화면을 아예 거치지 않고 바로 앱으로 들어간다.
  const { data: { session: existingSession } } = await sb.auth.getSession();
  if(existingSession) enterApp(existingSession);
  else exitApp();

  // 이후 로그인/로그아웃(매직링크 복귀, 토큰 만료 등) 변화에 반응한다.
  sb.auth.onAuthStateChange((event, session)=>{
    if(session){
      enterApp(session);
    }else if(event === 'SIGNED_OUT'){
      exitApp();
    }
  });
})().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin',
    '<p style="padding:16px;font-family:sans-serif">지도 데이터를 불러오지 못했습니다. 이 앱은 JSON을 fetch하므로 로컬 서버(예: npx serve)로 열어 주세요.</p>');
});
