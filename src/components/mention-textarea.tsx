"use client";

import {
  forwardRef,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  filterMentionCandidates,
  insertMentionAt,
  mentionToken,
  mentionTrigger,
  shortNamesFor,
  type MentionCandidate,
} from "@/lib/mentions";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
  candidates: MentionCandidate[];
  visibility?: "INTERNAL" | "SHARED";
  onChange?: (value: string) => void;
};

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea(
  {
    candidates,
    visibility = "SHARED",
    className,
    onChange,
    onKeyDown,
    value,
    defaultValue,
    ...rest
  },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(0);
  const [active, setActive] = useState(0);

  const matches = useMemo(
    () => filterMentionCandidates(candidates, query, visibility),
    [candidates, query, visibility],
  );
  const names = useMemo(() => shortNamesFor(candidates), [candidates]);
  const staff = matches.filter((c) => c.kind === "staff");
  const contacts = matches.filter((c) => c.kind === "customer");

  function assignRef(node: HTMLTextAreaElement | null) {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  function syncTrigger(text: string, cursor: number) {
    const trigger = mentionTrigger(text, cursor);
    if (trigger && candidates.length > 0) {
      setOpen(true);
      setQuery(trigger.query);
      setStart(trigger.start);
      setActive(0);
    } else {
      setOpen(false);
    }
  }

  function insert(c: MentionCandidate) {
    const ta = innerRef.current;
    if (!ta) return;
    const label = names.get(c.id) ?? c.name ?? c.email;
    const token = mentionToken(label, c.id);
    const cursor = ta.selectionStart ?? ta.value.length;
    const { next, cursor: nextCursor } = insertMentionAt(ta.value, start, cursor, token);
    if (onChange) {
      onChange(next);
    } else {
      ta.value = next;
    }
    setOpen(false);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = matches[active] ?? matches[0];
        if (pick) insert(pick);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  }

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={assignRef}
        value={value}
        defaultValue={defaultValue}
        className={cn(inputClass, className)}
        onKeyDown={handleKeyDown}
        onChange={(e) => {
          onChange?.(e.target.value);
          syncTrigger(e.target.value, e.target.selectionStart ?? 0);
        }}
        onClick={(e) => syncTrigger(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            syncTrigger(e.currentTarget.value, e.currentTarget.selectionStart ?? 0);
          }
        }}
      />
      {open && matches.length > 0 ? (
        <div
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-sm"
        >
          {staff.length > 0 ? (
            <Group
              label="Team"
              people={staff}
              names={names}
              activeId={matches[active]?.id}
              onPick={insert}
            />
          ) : null}
          {contacts.length > 0 ? (
            <Group
              label="Contacts"
              people={contacts}
              names={names}
              activeId={matches[active]?.id}
              onPick={insert}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

function Group({
  label,
  people,
  names,
  activeId,
  onPick,
}: {
  label: string;
  people: MentionCandidate[];
  names: Map<string, string>;
  activeId?: string;
  onPick: (c: MentionCandidate) => void;
}) {
  return (
    <div>
      <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </div>
      {people.map((c) => {
        const short = names.get(c.id) ?? c.name ?? c.email;
        return (
          <button
            key={c.id}
            type="button"
            role="option"
            aria-selected={c.id === activeId}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c)}
            className={cn(
              "flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[13px]",
              c.id === activeId ? "bg-brand-soft text-ink" : "text-ink hover:bg-surface-2",
            )}
          >
            <span className="truncate font-medium">{short}</span>
            {c.kind === "customer" ? (
              <span className="ml-2 shrink-0 text-[11.5px] text-ink-3">Contact</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
