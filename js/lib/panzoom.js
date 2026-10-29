// SVG viewBox 기반 확대·이동. 마우스 휠, 드래그, 두 손가락 핀치를 모두 처리하고,
// 거의 움직이지 않은 짧은 탭만 onTap 으로 알린다 (드래그 끝에 지역이 열리지 않게).

export function createPanZoom(svg, { minScale = 1, maxScale = 16, onTap } = {}) {
  const [x0, y0, w0, h0] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const home = { x: x0, y: y0, w: w0, h: h0 };
  let vb = { ...home };
  const pointers = new Map();
  let gesture = null;

  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  // preserveAspectRatio="xMidYMid meet" 을 고려해 화면 좌표 → SVG 좌표
  function toSvg(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / vb.w, r.height / vb.h);
    const offX = (r.width - vb.w * scale) / 2;
    const offY = (r.height - vb.h * scale) / 2;
    return { x: vb.x + (clientX - r.left - offX) / scale, y: vb.y + (clientY - r.top - offY) / scale };
  }
  const pxPerUnit = () => {
    const r = svg.getBoundingClientRect();
    return Math.min(r.width / vb.w, r.height / vb.h);
  };

  function clamp() {
    const minW = home.w / maxScale;
    const maxW = home.w / minScale;
    const w = Math.min(maxW, Math.max(minW, vb.w));
    const k = w / vb.w;
    vb.w = w; vb.h *= k;
    // 지도가 화면 밖으로 완전히 빠져나가지 않게
    vb.x = Math.min(home.x + home.w - vb.w * 0.25, Math.max(home.x - vb.w * 0.75, vb.x));
    vb.y = Math.min(home.y + home.h - vb.h * 0.25, Math.max(home.y - vb.h * 0.75, vb.y));
  }

  function zoomAt(pt, factor) {
    const nw = vb.w * factor;
    const nh = vb.h * factor;
    vb.x = pt.x - (pt.x - vb.x) * (nw / vb.w);
    vb.y = pt.y - (pt.y - vb.y) * (nh / vb.h);
    vb.w = nw; vb.h = nh;
    clamp(); apply();
  }

  function zoomCenter(factor) {
    zoomAt({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, factor);
  }

  function reset() { vb = { ...home }; apply(); }

  /** 영역(bbox)을 화면 위쪽 visibleFraction 안에 보이도록 맞춘다 (바텀 시트가 아래를 가릴 때). */
  function focusBox(box, { visibleFraction = 0.5, pad = 0.35 } = {}) {
    const r = svg.getBoundingClientRect();
    const aspect = r.width / r.height;
    let w = Math.max(box.w * (1 + pad * 2), home.w / maxScale);
    let hgt = w / aspect;
    const needH = (box.h * (1 + pad * 2)) / visibleFraction;
    if (hgt < needH) { hgt = needH; w = hgt * aspect; }
    w = Math.min(w, home.w);
    hgt = w / aspect;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    vb = { w, h: hgt, x: cx - w / 2, y: cy - hgt * (visibleFraction / 2) };
    apply();
  }

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomAt(toSvg(ev.clientX, ev.clientY), ev.deltaY < 0 ? 0.87 : 1 / 0.87);
  }, { passive: false });

  svg.addEventListener('dblclick', (ev) => { ev.preventDefault(); zoomAt(toSvg(ev.clientX, ev.clientY), 0.5); });

  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    svg.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) {
      gesture = { type: 'pan', startX: ev.clientX, startY: ev.clientY, vbx: vb.x, vby: vb.y, moved: false, t: performance.now() };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = {
        type: 'pinch', moved: true,
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        center: toSvg((a.x + b.x) / 2, (a.y + b.y) / 2),
        w: vb.w,
      };
    }
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId) || !gesture) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (gesture.type === 'pan' && pointers.size === 1) {
      const dx = ev.clientX - gesture.startX;
      const dy = ev.clientY - gesture.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) gesture.moved = true;
      if (!gesture.moved) return;
      const k = pxPerUnit();
      vb.x = gesture.vbx - dx / k;
      vb.y = gesture.vby - dy / k;
      clamp(); apply();
    } else if (gesture.type === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const target = gesture.w * (gesture.dist / dist);
      zoomAt(gesture.center, target / vb.w);
    }
  });

  function end(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    if (gesture?.type === 'pan' && !gesture.moved && ev.type === 'pointerup' && performance.now() - gesture.t < 600) {
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      onTap?.(hit);
    }
    if (pointers.size === 0) gesture = null;
    else if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      gesture = { type: 'pan', startX: p.x, startY: p.y, vbx: vb.x, vby: vb.y, moved: true, t: 0 };
    }
  }
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  apply();
  return { zoomIn: () => zoomCenter(0.7), zoomOut: () => zoomCenter(1 / 0.7), reset, focusBox, home };
}
