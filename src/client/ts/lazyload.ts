/**
 * Lazy-load images carrying `data-src`. As each scrolls near the viewport its
 * real source is swapped in; on decode it fades in (.loaded) over the ThumbHash
 * placeholder. Falls back to eager loading when IntersectionObserver is absent.
 */
function load(img: HTMLImageElement): void {
  const src = img.dataset.src;
  if (!src) return;
  img.src = src;
  delete img.dataset.src;
  if (img.complete) {
    img.classList.add("loaded");
  } else {
    img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
  }
}

export function initLazyLoad(root: ParentNode = document): void {
  const images = root.querySelectorAll<HTMLImageElement>("img[data-src]");

  if (!("IntersectionObserver" in window)) {
    images.forEach(load);
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        load(entry.target as HTMLImageElement);
        obs.unobserve(entry.target);
      }
    },
    { rootMargin: "400px 0px" },
  );

  images.forEach((img) => observer.observe(img));
}
