import { layout } from "./layout.js";
import { esc } from "./util.js";

export function adminLoginPage(opts: { error?: string; next?: string } = {}): string {
  const { error, next = "/" } = opts;
  return layout({
    title: "Admin — Still",
    body: `<main class="max-w-[480px] mx-auto px-5 sm:px-8 py-24">
      <p class="font-mono text-[10px] label text-stone uppercase">Admin</p>
      <h1 class="font-serif text-[32px] mt-3">Sign in</h1>
      ${error ? `<p class="font-mono text-[10px] label text-red-600 uppercase mt-4">${esc(error)}</p>` : ""}
      <form method="POST" action="/admin/login" class="mt-8 flex flex-col gap-5">
        <input type="hidden" name="next" value="${esc(next)}" />
        <label class="flex flex-col gap-1.5">
          <span class="font-mono text-[10px] label text-stone uppercase">Secret</span>
          <input type="password" name="secret" required autocomplete="current-password"
                 class="border border-hairline bg-paper px-3 py-2 font-mono text-[13px] focus:outline-none focus:border-ink" />
        </label>
        <button type="submit"
                class="self-start font-mono text-[11px] label uppercase bg-ink text-paper px-5 py-2.5 hover:bg-stone transition-colors">
          Sign in
        </button>
      </form>
    </main>`,
  });
}
