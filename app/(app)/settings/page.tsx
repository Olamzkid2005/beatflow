"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/icon";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  Field,
  Input,
  Select,
  StatusDot,
  Textarea,
} from "@/components/ui/primitives";
import { TagInput } from "@/components/ui/tag-input";
import { TagSuggestionPicker } from "@/components/ui/tag-suggestions";
import {
  DEFAULT_SETTINGS,
  readSettings,
  resetSettings,
  writeSettings,
  type ProducerSettings,
} from "@/lib/settings";
import {
  DESCRIPTION_TEMPLATES,
  DESCRIPTION_TOKEN_HELP,
} from "@/lib/release-templates";
import { mergeTag } from "@/lib/tag-suggestions";

const subscribe = () => () => {};

const commonTimeZones = [
  "UTC",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
];

function validTimeZone(value: string): boolean {
  if (!value.trim()) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format();
    return true;
  } catch {
    return false;
  }
}

export default function SettingsPage() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <SettingsForm /> : <SettingsSkeleton />;
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-container-high" />
        <div className="h-8 w-56 animate-pulse rounded bg-surface-container-high" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-surface-container-high" />
      </div>
      <div className="h-96 animate-pulse rounded-2xl border border-surface-container-highest bg-surface-container-low/60" />
    </div>
  );
}

function SettingsForm() {
  // This component mounts only after the client-only gate above, so local
  // storage can seed the form without a server/client hydration mismatch.
  const [settings, setSettings] = useState<ProducerSettings>(readSettings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [saved]);

  function update<K extends keyof ProducerSettings>(key: K, value: ProducerSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validTimeZone(settings.timezone)) {
      setError("Enter a valid IANA timezone, such as Europe/London or America/New_York.");
      setSaved(false);
      return;
    }

    try {
      writeSettings({
        ...settings,
        producerName: settings.producerName.trim(),
        timezone: settings.timezone.trim(),
        descriptionTemplate: settings.descriptionTemplate.trim(),
      });
      setError(null);
      setSaved(true);
    } catch {
      setError("This browser blocked local storage, so the settings could not be saved.");
      setSaved(false);
    }
  }

  function handleReset() {
    if (!window.confirm("Reset producer settings in this browser?")) return;
    try {
      resetSettings();
      setSettings({ ...DEFAULT_SETTINGS, defaultTags: [] });
      setError(null);
      setSaved(false);
    } catch {
      setError("This browser blocked local storage, so the settings could not be reset.");
      setSaved(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Settings
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Default producer name, timezone, tags, and description template for new uploads.
          </p>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">
            Applied when the upload desk opens. Changes made there override these defaults for
            that upload.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={saved ? "success" : "neutral"}>
            <StatusDot tone={saved ? "success" : "muted"} />
            {saved ? "Saved locally" : "Local settings"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("beatflow:onboarding", { detail: { restart: true } }),
              )
            }
          >
            <Icon name="spark" className="h-3.5 w-3.5" />
            Replay walkthrough
          </Button>
        </div>
      </header>

      <div>
        <form id="settings-form" onSubmit={handleSave} className="flex min-w-0 flex-col gap-5">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="user" className="h-4 w-4" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
                  Identity
                </p>
                <h2 className="text-base font-semibold">Producer profile</h2>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <Field
                label="Producer name"
                htmlFor="producer-name"
                hint="Used in your workflow"
              >
                <Input
                  id="producer-name"
                  data-tour="producer-name"
                  value={settings.producerName}
                  onChange={(event) => update("producerName", event.target.value)}
                  placeholder="Your producer name"
                  maxLength={80}
                />
              </Field>

              <Field
                label="Working timezone"
                htmlFor="producer-timezone"
                hint="IANA timezone"
              >
                <Input
                  id="producer-timezone"
                  value={settings.timezone}
                  onChange={(event) => update("timezone", event.target.value)}
                  placeholder="Browser default"
                  list="timezone-options"
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id="timezone-options">
                  {commonTimeZones.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </Field>
              <p className="text-xs leading-5 text-on-surface-variant">
                New uploads use this timezone for schedule conversion. Leave it blank to use the
                browser timezone.
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary-container/15 text-tertiary">
                <Icon name="spark" className="h-4 w-4" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
                  Defaults
                </p>
                <h2 className="text-base font-semibold">New upload template</h2>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Field label="Default tags" htmlFor="default-tags" hint="Enter to add">
                  <TagInput
                    id="default-tags"
                    value={settings.defaultTags}
                    onChange={(tags) => update("defaultTags", tags)}
                    placeholder="beat, instrumental, type beat…"
                  />
                </Field>
                <TagSuggestionPicker
                  id="default-tag-suggestions"
                  selected={settings.defaultTags}
                  onSelect={(tag) => update("defaultTags", mergeTag(settings.defaultTags, tag))}
                />
              </div>

              <Field
                label="Preferred immediate visibility"
                htmlFor="default-visibility"
                hint="Scheduled uploads remain private until their publish time"
              >
                <select
                  id="default-visibility"
                  className="h-11 w-full rounded-xl border border-outline/60 bg-surface-container-lowest px-3 text-sm text-on-surface"
                  value={settings.defaultVisibility}
                  onChange={(event) => update("defaultVisibility", event.target.value as ProducerSettings["defaultVisibility"])}
                >
                  <option value="unlisted">Unlisted — recommended for review</option>
                  <option value="public">Public immediately</option>
                </select>
              </Field>

              <Field
                label="Starting description"
                htmlFor="description-template"
                hint={`${new TextEncoder().encode(settings.descriptionTemplate).length}/5000 bytes`}
              >
                <Textarea
                  id="description-template"
                  value={settings.descriptionTemplate}
                  onChange={(event) => update("descriptionTemplate", event.target.value)}
                  rows={5}
                  placeholder="Credits, links, or a reusable description…"
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-on-surface-variant">
                  Start from a template
                </span>
                <Select
                  id="description-template-preset"
                  aria-label="Insert a description template"
                  value=""
                  onChange={(event) => {
                    const template = DESCRIPTION_TEMPLATES.find(
                      (item) => item.id === event.target.value,
                    );
                    if (!template) return;
                    if (
                      settings.descriptionTemplate.trim() &&
                      !window.confirm(
                        "Replace the current starting description with this template?",
                      )
                    ) {
                      return;
                    }
                    update("descriptionTemplate", template.body);
                  }}
                >
                  <option value="">Insert a template…</option>
                  {DESCRIPTION_TEMPLATES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <span className="text-[11px] leading-5 text-outline">
                  Filled automatically on new uploads:{" "}
                  {DESCRIPTION_TOKEN_HELP.map((entry) => entry.token).join(", ")}. Leave the
                  bracketed contact details and replace them once.
                </span>
              </div>
            </div>
          </Card>

          {error ? (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-error/25 bg-error-container/15 p-3 text-sm text-error">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="lg">
              <Icon name={saved ? "check" : "save"} className="h-4 w-4" />
              {saved ? "Saved" : "Save settings"}
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={handleReset}>
              Reset to defaults
            </Button>
            <Link
              href="/generate"
              className={buttonClass({ variant: "ghost", size: "lg", className: "ml-auto" })}
            >
              Back to Studio
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
