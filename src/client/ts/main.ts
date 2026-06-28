import { initAdmin } from "./admin.js";
import { initAdminPhotos } from "./admin-photos.js";
import { initLazyLoad } from "./lazyload.js";
import { initNav } from "./nav.js";
import { initShowcase } from "./showcase.js";
import { applyThumbHashes } from "./thumbhash.js";
import { initViewer } from "./viewer.js";

function init(): void {
  applyThumbHashes();
  initLazyLoad();
  initNav();
  initShowcase();
  initViewer();
  initAdmin();
  initAdminPhotos();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
