export interface ModalController {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** While locked, close/Escape/scrim are ignored (e.g. uploads in flight). */
  setLocked(locked: boolean): void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Overlay dialog controller over SSR markup, following the lightbox
 * conventions: `hidden` class toggle, body scroll lock, focus save/restore,
 * Escape to close, Tab focus trap. Elements with [data-modal-close] inside
 * `root` close the modal on click (including the scrim).
 */
export function createModal(root: HTMLElement): ModalController {
  let lastFocused: HTMLElement | null = null;
  let locked = false;

  function isOpen(): boolean {
    return !root.classList.contains("hidden");
  }

  function open(): void {
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    root.focus();
  }

  function close(): void {
    if (locked) return;
    root.classList.add("hidden");
    document.body.style.overflow = "";
    lastFocused?.focus();
  }

  for (const el of root.querySelectorAll<HTMLElement>("[data-modal-close]")) {
    el.addEventListener("click", close);
  }

  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null,
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    open,
    close,
    isOpen,
    setLocked(value: boolean) {
      locked = value;
    },
  };
}
