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
  StatusDot,
  Textarea,
} from "@/components/ui/primitives";
import { TagInput } from "@/components/ui/tag-input";
import {
  DEFAULT_SETTINGS,
  readSettings,
  resetSettings,
  writeSettings,
  type ProducerSettings,
} from "@/lib/settings";

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
    resetSettings();
    setSettings({ ...DEFAULT_SETTINGS, defaultTags: [] });
    setError(null);
    setSaved(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
            <span>Studio</span>
            <span aria-hidden>/</span>
            <span className="text-on-surface">Settings</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Producer settings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-on-surface-variant">
            Defaults for new uploads. These live in this browser and never leave it.
          </p>
        </div>
        <Badge tone={saved ? "success" : "neutral"}>
          <StatusDot tone={saved ? "primary" : "muted"} />
          {saved ? "Saved locally" : "Local settings"}
        </Badge>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
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
              <Field label="Default tags" htmlFor="default-tags" hint="Enter to add">
                <TagInput
                  id="default-tags"
                  value={settings.defaultTags}
                  onChange={(tags) => update("defaultTags", tags)}
                  placeholder="beat, instrumental, type beat…"
                />
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
            <span className="ml-auto font-mono text-[10px] text-outline">
              Applies to the next upload
            </span>
          </div>
        </form>

        <aside className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-primary">
              <Icon name="shield" className="h-4 w-4" />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em]">Storage</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-on-surface-variant">
              Settings use this browser&apos;s local storage. They are not attached to your Google
              account and do not follow you to another device.
            </p>
            <div className="mt-3 rounded-lg border border-outline-variant/60 bg-surface-container-lowest/70 px-2.5 py-2 font-mono text-[10px] text-outline">
              This browser only
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-tertiary">
              <Icon name="info" className="h-4 w-4" />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em]">Scope</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-on-surface-variant">
              Defaults are applied when the upload desk mounts. Editing a field there always
              takes precedence for that upload.
            </p>
            <Link
              href="/generate"
              className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 w-full" })}
            >
              Go to upload desk
              <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
