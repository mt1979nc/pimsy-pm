"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { NavLink } from "@/components/nav-link";
import { cn } from "@/lib/cn";
import {
  STAFF_SIDEBAR_OPEN_KEY,
  parseOpenSectionIds,
  sectionIdForPath,
  toggleOpenSection,
  visibleOpenSectionIds,
  type StaffSidebarSection,
  type StaffSidebarSectionId,
} from "@/lib/staff-sidebar";

const OPEN_EVENT = "path-sidebar-sections";

/** Used when localStorage is blocked. `undefined` means read from storage. */
let fallback: string | null | undefined;

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key != null && event.key !== STAFF_SIDEBAR_OPEN_KEY) return;
    fallback = undefined;
    onChange();
  };
  window.addEventListener(OPEN_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(OPEN_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readStored(): string | null {
  if (fallback !== undefined) return fallback;
  try {
    return window.localStorage.getItem(STAFF_SIDEBAR_OPEN_KEY);
  } catch {
    return null;
  }
}

function serverSnapshot(): string | null {
  return null;
}

function writeStored(ids: readonly StaffSidebarSectionId[]) {
  const raw = JSON.stringify(ids);
  try {
    window.localStorage.setItem(STAFF_SIDEBAR_OPEN_KEY, raw);
    fallback = undefined;
  } catch {
    fallback = raw;
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function StaffSidebar({ sections }: { sections: StaffSidebarSection[] }) {
  const pathname = usePathname() ?? "";
  const raw = useSyncExternalStore(subscribe, readStored, serverSnapshot);
  const persisted = parseOpenSectionIds(raw);
  const activeId = sectionIdForPath(pathname, sections);
  const openIds = visibleOpenSectionIds(persisted, activeId);
  const open = new Set(openIds);

  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 py-2" aria-label="Staff">
      {sections.map((section, index) => {
        const expanded = open.has(section.id);
        const buttonId = `staff-nav-${section.id}-button`;
        const panelId = `staff-nav-${section.id}`;
        return (
          <div key={section.id} className={cn(index > 0 && "mt-3")}>
            <button
              type="button"
              id={buttonId}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => writeStored(toggleOpenSection(openIds, section.id))}
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-[11.5px] font-semibold leading-tight text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className={cn("shrink-0 transition-transform", expanded && "rotate-90")}
                aria-hidden
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
              <span className="min-w-0 flex-1">{section.label}</span>
            </button>
            <div id={panelId} role="group" aria-labelledby={buttonId} hidden={!expanded} className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} href={item.href} exact={item.exact} badge={item.badge}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
