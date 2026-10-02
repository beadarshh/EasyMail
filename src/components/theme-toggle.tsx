"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "./ui";

type Theme = "system" | "light" | "dark";

// The source of truth is <html data-theme>, set on the server from the "theme" cookie.
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? "system";

function setTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") {
    delete root.dataset.theme;
    document.cookie = "theme=; path=/; max-age=0; samesite=lax";
  } else {
    root.dataset.theme = t;
    document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  }
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** `compact`: a single button that cycles light → dark → system (for the collapsed sidebar). */
export function ThemeToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system" as Theme);
  if (compact) {
    const i = OPTIONS.findIndex((o) => o.value === theme);
    const { label, icon: Icon } = OPTIONS[i];
    const next = OPTIONS[(i + 1) % OPTIONS.length];
    return (
      <button
        type="button"
        title={`Theme: ${label} (switch to ${next.label})`}
        onClick={() => setTheme(next.value)}
        className={cn("grid h-8 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-fg", className)}
      >
        <Icon className="size-3.5" />
        <span className="sr-only">Theme: {label}</span>
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-lg border border-border bg-surface p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "grid h-7 flex-1 place-items-center rounded-md px-2 text-muted transition-colors hover:text-fg",
            theme === value && "bg-surface-2 text-fg",
          )}
        >
          <Icon className="size-3.5" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
