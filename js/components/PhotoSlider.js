// 사진 슬라이드: 가로 스크롤 + 스냅. 다음 사진이 살짝 보여 넘길 수 있다는 걸 모양으로 알린다.
import { h } from '../lib/dom.js';

/** photos: [{ url, alt, caption }] */
export function PhotoSlider(photos) {
  const slides = photos.map((p) => h('li', { class: 'slider__slide' },
    h('img', { src: p.url, alt: p.alt, loading: 'lazy', decoding: 'async' }),
    p.caption ? h('p', { class: 'slider__cap num' }, p.caption) : null));
  const track = h('ul', { class: 'slider__track', tabindex: '0', 'aria-label': `사진 ${photos.length}장, 옆으로 넘겨 보기` }, slides);
  const counter = h('span', { class: 'slider__count num', 'aria-hidden': 'true' }, `1 / ${photos.length}`);

  track.addEventListener('scroll', () => {
    let nearest = 0; let best = Infinity;
    slides.forEach((sl, i) => {
      const d = Math.abs(sl.offsetLeft - track.offsetLeft - track.scrollLeft);
      if (d < best) { best = d; nearest = i; }
    });
    counter.textContent = `${nearest + 1} / ${photos.length}`;
  }, { passive: true });

  return h('div', { class: 'slider' }, track, photos.length > 1 ? counter : null);
}
