"use client";

import { useState } from "react";

import { Icon } from "./icon";
import { cn } from "./primitives";

export function TagInput({
  id,
  value,
  onChange,
  placeholder = "Add a tag and press Enter",
  className,
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw = draft) {
    const additions = raw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (!additions.length) {
      setDraft("");
      return;
    }
    const next = [...value];
    for (const tag of additions) {
      if (!next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div
      className={cn(
        "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border border-outline/60 bg-surface-container-lowest p-1.5 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
        className,
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-2 py-1 text-xs text-on-surface"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((item) => item !== tag))}
            className="flex h-6 w-6 items-center justify-center rounded text-outline transition hover:text-error"
            aria-label={`Remove ${tag}`}
          >
            <Icon name="close" className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (next.includes(",")) commit(next);
          else setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit()}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-base text-on-surface outline-none placeholder:text-outline sm:text-sm"
        aria-label="Add a video tag"
      />
    </div>
  );
}
