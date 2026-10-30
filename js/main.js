// 앱 시작점: 지도 데이터 → 서버 연결(실패하면 예시 기록) → 화면 4개 → 해시 라우터.
import { h } from './lib/dom.js';
import { loadMaps } from './data/maps.js';
import { boot, setLoginPrompt } from './data/store.js';
import { createAuthGate } from './components/AuthGate.js';
import { BottomNav, createToast, TABS } from './components/controls.js';
import { createRegionSheet } from './components/RegionSheet.js';
import { MapView } from './views/MapView.js';
import { TimelineView } from './views/TimelineView.js';
import { AnalyticsView } from './views/AnalyticsView.js';
import { SettingsView } from './views/SettingsView.js';
import { applyTheme, readTheme } from './lib/theme.js';

applyTheme(readTheme());     // 첫 화면부터 고른 색으로 (깜빡임 방지)


const app = document.getElementById('app');
const main = h('main', { class: 'views', id: 'main' },
  h('p', { class: 'boot-msg', role: 'status' }, '지도를 펼치는 중…'));
const nav = BottomNav();
const toast = createToast();
app.append(main, nav);
document.body.append(toast);

async function start() {
  let maps;
  try {
    [maps] = await Promise.all([loadMaps(), boot()]);
  } catch (err) {
    console.error(err);
    main.replaceChildren(h('div', { class: 'boot-msg', role: 'alert' },
      h('p', {}, '지도 데이터를 불러오지 못했어요. 이 앱은 로컬 서버(예: npx serve)나 배포 주소에서 열어야 해요.'),
      h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => location.reload() }, '다시 시도')));
    return;
  }

  let mapView = null;
  const regionSheet = createRegionSheet({ maps, toast, onClose: () => mapView?.clearSelection() });
  mapView = MapView({ maps, regionSheet });
  const views = {
    map: mapView,
    timeline: TimelineView({ maps, onOpen: (scope, id, name, opts) => { go('map'); mapView.showRegion(scope, id, name, opts); } }),
    analytics: AnalyticsView({ maps }),
    settings: SettingsView({ toast }),
  };
  main.replaceChildren(...Object.values(views).map((v) => v.el));
  document.body.append(regionSheet.el);

  // 로그인 관문: 로그인 안 한 채 기록을 남기려 하면 여기로
  const gate = createAuthGate({ toast });
  document.body.append(gate.el);
  setLoginPrompt((reason) => gate.open(reason));

  function route() {
    const id = TABS.some((t) => `#${t.id}` === location.hash) ? location.hash.slice(1) : 'map';
    Object.entries(views).forEach(([k, v]) => { v.el.hidden = k !== id; });
    app.dataset.view = id;
    nav.setActive(id);
    if (id !== 'map' && regionSheet.current) regionSheet.close();
    if (id !== 'map') main.scrollTop = 0;
  }
  function go(id) {
    if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    route();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  route();
  gate.openIfNeeded();
}

start();
