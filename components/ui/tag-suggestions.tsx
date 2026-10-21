"use client";

import { hasTag, TAG_GROUPS } from "@/lib/tag-suggestions";

import { Select } from "./primitives";

/**
 * A native select so keyboard, screen-reader, and mobile behaviour come from the
 * platform. It always shows its placeholder and reports the picked tag to the
 * caller, which owns the real value.
 */
export function TagSuggestionPicker({
  onSelect,
  selected = [],
  id,
  className,
  "aria-describedby": describedBy,
}: {
  onSelect: (tag: string) => void;
  /** Tags already in the field; matching suggestions are shown as added. */
  selected?: readonly string[];
  id?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  return (
    <Select
      id={id}
      aria-label="Add a suggested tag"
      aria-describedby={describedBy}
      value=""
      onChange={(event) => {
        const tag = event.currentTarget.value;
        if (tag) onSelect(tag);
      }}
      className={className}
    >
      <option value="">Add a suggested tag…</option>
      {TAG_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.tags.map((tag) => (
            <option key={tag} value={tag} disabled={hasTag(selected, tag)}>
              {hasTag(selected, tag) ? `${tag} · added` : tag}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
