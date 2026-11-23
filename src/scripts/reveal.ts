/* Aparición al hacer scroll (.rv → .in) y pausa de las estrellas que no están en pantalla. */

export function initReveal(): void {
  document.documentElement.dataset.rvReady = '1';
  const items = document.querySelectorAll<HTMLElement>('.rv');
  const skies = document.querySelectorAll<HTMLElement>('.stars');

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.02, rootMargin: '0px 0px 2% 0px' },
  );
  items.forEach((el) => io.observe(el));

  /* las estrellas solo se animan cuando su sección está en pantalla */
  const sky = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle('off', !e.isIntersecting)),
    { rootMargin: '120px 0px' },
  );
  skies.forEach((el) => sky.observe(el));
}
