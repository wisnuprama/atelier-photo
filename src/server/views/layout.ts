import { icon } from "./icons.js";
import { esc } from "./util.js";

export interface LayoutOptions {
  title: string;
  /** Pre-rendered, trusted HTML for <main>. */
  body: string;
  /** Which top-nav link reads as current. */
  activeNav?: "albums" | null;
}

const NAV_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  key?: "albums";
}> = [
  { href: "/", label: "Albums", key: "albums" },
  // { href: "#", label: "About" },
  { href: "#", label: "Contact" },
];

function desktopNav(active: LayoutOptions["activeNav"]): string {
  return NAV_LINKS.map((l) => {
    const current = l.key && l.key === active;
    const cls = current ? "text-ink" : "text-stone hover:text-ink transition-colors";
    return `<a href="${esc(l.href)}" class="${cls}"${current ? ' aria-current="page"' : ""}>${esc(l.label)}</a>`;
  }).join("");
}

function mobileNav(): string {
  return NAV_LINKS.map(
    (l) =>
      `<a href="${esc(l.href)}" class="text-left ${l.key ? "text-ink" : "text-stone"}">${esc(l.label)}</a>`,
  ).join("");
}

export function layout(opts: LayoutOptions): string {
  const { title, body, activeNav = null } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/css/app.css" />
</head>
<body class="bg-paper text-ink font-sans antialiased">

<header id="nav" class="sticky top-0 z-40 bg-paper/90 backdrop-blur-sm border-b border-transparent transition-colors">
  <div class="max-w-[1400px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
    <a href="/" class="text-left">
      <span class="font-serif text-[22px] leading-none tracking-[0.04em]">Atelier</span>
      <span class="block font-mono text-[9px] label text-stone mt-0.5">WISNU PHOTOGRAPHY</span>
    </a>

    <nav class="hidden sm:flex items-center gap-9 font-sans text-[11px] label-tight uppercase">
      ${desktopNav(activeNav)}
    </nav>

    <button class="sm:hidden p-1" data-nav-toggle aria-controls="mobileMenu" aria-expanded="false" aria-label="Open menu">
      ${icon("menu", { class: "w-5 h-5" })}
    </button>
  </div>

  <div id="mobileMenu" class="hidden sm:hidden border-t border-hairline bg-paper">
    <nav class="px-5 py-4 flex flex-col gap-4 font-sans text-[13px] label-tight uppercase">
      ${mobileNav()}
    </nav>
  </div>
</header>

${body}

<footer class="border-t border-hairline mt-16">
  <div class="max-w-[1400px] mx-auto px-5 sm:px-8 py-6">
    <p class="font-mono text-[10px] label text-stone uppercase tracking-widest">
      &copy; ${new Date().getFullYear()} Wisnu Pramadhitya Ramadhan
    </p>
  </div>
</footer>

<script type="module" src="/js/app.js"></script>
</body>
</html>`;
}
