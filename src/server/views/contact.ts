import { esc } from "./util.js";

export interface ContactPageOptions {
  /** Owner's email address; may be empty. */
  email: string;
  /** Greeting headline (already resolved to its fallback). */
  greeting: string;
}

export function contactPage(opts: ContactPageOptions): string {
  const { email, greeting } = opts;

  const emailBlock = email
    ? `<a href="mailto:${esc(email)}"
          class="mt-6 inline-block font-mono text-[15px] sm:text-[17px] text-stone hover:text-ink transition-colors break-all">
        ${esc(email)}
      </a>`
    : "";

  return `<main class="flex-1 flex flex-col items-center justify-center text-center px-5 sm:px-8 py-24">
    <h1 class="font-serif text-[34px] sm:text-[46px] leading-[1.05]">${esc(greeting)}</h1>
    ${emailBlock}
  </main>`;
}
