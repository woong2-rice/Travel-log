// 로그인 전이나 서버에 닿지 않을 때 보여주는 예시 기록.
// 실제 지역 id(data/*.json)를 쓰고, 금액은 항목별로만 적어 합계는 항상 계산으로 낸다.
// ⚠️ 출시 전 확인: 이 파일의 이름·금액·메모는 모두 예시입니다.

const e = (id, scope, regionId, regionName, status, startDate, endDate, companion, costs = {}, extra = {}) => ({
  id: `sample-${id}`, scope, regionId, regionName, status, startDate, endDate: endDate || startDate,
  companion, place: extra.place || '', note: extra.note || '',
  costs: { flight: 0, lodging: 0, transport: 0, food: 0, other: 0, ...costs },
  photo: null,
});

export const SAMPLE_ENTRIES = [
  e(1, 'domestic', '32030', '강릉시', 'visited', '2021-07-24', '2021-07-26', '가족', { lodging: 240000, transport: 86000, food: 132000, other: 30000 }, { note: '경포 바다, 초당순두부' }),
  e(2, 'domestic', '31370', '가평군', 'visited', '2021-10-09', null, '대학 동기', { transport: 24000, food: 58000 }),
  e(3, 'domestic', '39010', '제주시', 'visited', '2022-02-11', '2022-02-13', '민수', { lodging: 210000, transport: 140000, food: 168000 }, { place: '애월, 협재' }),
  e(4, 'domestic', '39020', '서귀포시', 'visited', '2022-02-13', '2022-02-14', '민수', { lodging: 120000, food: 64000 }),
  e(5, 'domestic', '37020', '경주시', 'visited', '2022-05-05', '2022-05-06', '가족', { lodging: 160000, transport: 92000, food: 110000, other: 26000 }, { place: '불국사, 황리단길' }),
  e(6, 'domestic', '36020', '여수시', 'visited', '2022-08-15', '2022-08-17', '지윤', { lodging: 230000, transport: 118000, food: 154000 }),
  e(7, 'domestic', '36030', '순천시', 'visited', '2022-08-17', null, '지윤', { food: 42000, other: 8000 }, { place: '순천만 습지' }),
  e(8, 'domestic', '11010', '종로구', 'visited', '2022-11-19', null, '', { food: 23000, other: 15000 }, { place: '창덕궁 후원' }),
  e(9, 'world', 'jpn-1829', '후쿠오카현 · 일본', 'visited', '2023-01-14', '2023-01-16', '민수', { flight: 389000, lodging: 264000, transport: 46000, food: 210000, other: 72000 }),
  e(10, 'domestic', '33380', '단양군', 'visited', '2023-04-08', '2023-04-09', '가족', { lodging: 98000, transport: 54000, food: 76000 }, { place: '도담삼봉' }),
  e(11, 'domestic', '32060', '속초시', 'visited', '2023-06-03', '2023-06-04', '대학 동기', { lodging: 140000, transport: 64000, food: 126000 }),
  e(12, 'domestic', '32410', '양양군', 'visited', '2023-06-04', null, '대학 동기', { food: 38000, other: 40000 }, { note: '처음 서핑' }),
  e(13, 'domestic', '37020', '경주시', 'visited', '2023-09-27', '2023-09-30', '가족', { lodging: 180000, transport: 88000, food: 136000 }),
  e(14, 'domestic', '38050', '통영시', 'visited', '2024-03-01', '2024-03-03', '지윤', { lodging: 170000, transport: 102000, food: 148000 }),
  e(15, 'domestic', '38090', '거제시', 'visited', '2024-03-03', null, '지윤', { food: 52000, other: 12000 }),
  e(16, 'world', 'vietnam-qungnam', '꽝남 · 베트남', 'visited', '2024-07-26', '2024-07-30', '민수, 지윤', { flight: 412000, lodging: 286000, transport: 38000, food: 164000, other: 58000 }, { place: '다낭, 호이안' }),
  e(17, 'domestic', '32010', '춘천시', 'visited', '2024-10-12', null, '가족', { transport: 30000, food: 64000 }),
  e(18, 'world', 'jpn-1827', '사가현 · 일본', 'visited', '2025-02-08', '2025-02-10', '가족', { flight: 318000, lodging: 342000, transport: 52000, food: 186000 }, { note: '우레시노 온천' }),
  e(19, 'domestic', '32030', '강릉시', 'visited', '2025-05-03', '2025-05-05', '지윤', { lodging: 198000, transport: 92000, food: 141000 }),
  e(20, 'domestic', '21090', '해운대구', 'visited', '2025-08-14', '2025-08-16', '민수', { lodging: 220000, transport: 108000, food: 172000 }),
  e(21, 'domestic', '37040', '안동시', 'visited', '2025-11-22', null, '가족', { transport: 41000, food: 48000 }, { place: '하회마을' }),
  e(22, 'world', 'jpn-1847', '홋카이도 · 일본', 'visited', '2026-01-17', '2026-01-20', '민수', { flight: 486000, lodging: 412000, transport: 96000, food: 238000, other: 64000 }, { place: '삿포로, 오타루' }),
  e(23, 'domestic', '38350', '남해군', 'visited', '2026-04-11', '2026-04-12', '지윤', { lodging: 150000, transport: 96000, food: 118000 }),
  e(24, 'domestic', '32030', '강릉시', 'visited', '2026-06-06', '2026-06-07', '가족', { lodging: 210000, transport: 84000, food: 120000 }),
  e(25, 'domestic', '34330', '부여군', 'visited', '2026-09-26', '2026-09-28', '가족', { lodging: 130000, transport: 62000, food: 96000 }),
  e(26, 'domestic', '32330', '영월군', 'planned', '2026-12-19', '2026-12-21', '지윤'),
  e(27, 'world', 'thailand-northern', '북부 · 태국', 'planned', '2027-02-10', '2027-02-14', '민수', {}, { place: '치앙마이' }),
  e(28, 'world', 'france-ledefrance', '일드프랑스 · 프랑스', 'wishlist', null, null, ''),
  e(29, 'domestic', '37430', '울릉군', 'wishlist', null, null, ''),
];
