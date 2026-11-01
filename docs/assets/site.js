// onde decorative nell'intestazione
const bars = document.querySelector('.bars');
for (let i = 0; i < 28; i++) {
  const b = document.createElement('i');
  b.style.animationDelay = `${(Math.sin(i * 1.7) * 0.5 + 0.5) * -1.2}s`;
  b.style.animationDuration = `${0.9 + ((i * 37) % 7) / 10}s`;
  bars.appendChild(b);
}

// lo screenshot si "raddrizza" scorrendo
const frame = document.getElementById('hero-frame');
const flat = () => frame.classList.toggle('flat', window.scrollY > 60);
addEventListener('scroll', flat, { passive: true }); flat();

// comparsa delle sezioni
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -8% 0px' }) : null;
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

// demo del click: casse "umane" (leggermente irregolari) e le tre modalità
const N = 12, beat = 100 / N;
const kicks = Array.from({ length: N }, (_, i) => beat * (i + 0.5) + [0.9, -0.6, 1.4, -1.1, 0.4, 1.8, -0.3, 1.2, 2.1, 1.5, 2.6, 2.2][i]);
const drift = (i) => (kicks.slice(Math.max(0, i - 2), i + 3).reduce((a, k, j, arr) => a + k - beat * (Math.max(0, i - 2) + j + 0.5), 0)
  / kicks.slice(Math.max(0, i - 2), i + 3).length);
document.querySelectorAll('.ticks-row').forEach((row) => {
  const mode = row.dataset.mode;
  kicks.forEach((k) => { const d = document.createElement('span'); d.className = 'kick'; d.style.left = `${k}%`; row.appendChild(d); });
  for (let i = 0; i < N; i++) {
    const x = mode === 'adapt' ? kicks[i] : mode === 'smooth' ? beat * (i + 0.5) + drift(i) : beat * (i + 0.5);
    const t = document.createElement('i');
    if (i % 4 === 0) t.className = 'acc';
    t.style.left = `calc(${x}% - 1.5px)`;
    row.appendChild(t);
  }
});

// schede di installazione
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
  document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('panel-hidden', p.dataset.panel !== b.dataset.tab));
}));

// forme d'onda delle finte schermate: barre pseudo-casuali ripetibili; data-fill = parte già registrata
document.querySelectorAll('.wave-mock').forEach((w) => {
  let seed = Number(w.dataset.seed || 1);
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const n = Number(w.dataset.bars || 90), fill = w.dataset.fill != null ? Number(w.dataset.fill) : 1;
  const from = Number(w.dataset.from || 0);
  for (let i = 0; i < n; i++) {
    const b = document.createElement('i');
    const env = 0.35 + 0.65 * Math.abs(Math.sin(i / 7 + seed % 5));
    b.style.height = `${Math.max(6, Math.round((0.25 + 0.75 * rnd()) * env * 100))}%`;
    if (i / n < from || i / n > fill) b.className = 'off';
    w.appendChild(b);
  }
});
