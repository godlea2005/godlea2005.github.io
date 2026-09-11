import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Shared modal boundary: background inert, scroll lock and focus lifecycle. */
export function ModalSurface({
  children,
  onClose,
  label,
  className,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  className: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current!;
    const siblings = Array.from(document.body.children).filter(
      (element) => element !== layerRef.current,
    );
    const inertBefore = siblings.map((element) =>
      element.hasAttribute("inert"),
    );
    const overflow = document.body.style.overflow;
    siblings.forEach((element) => element.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";
    (panel.querySelector<HTMLElement>("[data-modal-focus]") ?? panel).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ),
      ).filter((element) => !element.closest('[hidden],[aria-hidden="true"]'));
      const first = focusable[0],
        last = focusable.at(-1);
      if (!first) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !focusable.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      siblings.forEach((element, index) => {
        if (!inertBefore[index]) element.removeAttribute("inert");
      });
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className={className}
      ref={layerRef}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
