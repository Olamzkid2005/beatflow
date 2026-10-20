"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { Button, Card, cn, Input, Textarea } from "@/components/ui/primitives";
import {
  readOnboardingProgress,
  writeOnboardingProgress,
  type OnboardingProgress,
} from "@/lib/onboarding";
import {
  captureBaseline,
  hasFile,
  measuredLayout,
  missingLayout,
  practiceSatisfied,
  producerNameChanged,
  type MeasuredRect,
  type PracticeProbe,
} from "@/lib/onboarding-tour";
import { readSettings, writeSettings, type ProducerSettings } from "@/lib/settings";
import { browserTimeZone } from "@/lib/time";

type Practice = PracticeProbe & {
  /** Text shown while the step is waiting on the user. */
  instruction: string;
  /** Text shown once the action is observed. */
  success: string;
  /** Marks the step done when this selector is clicked. */
  watchClick?: string;
};

type TourStep = {
  route: string;
  selector?: string;
  eyebrow: string;
  title: string;
  body: string;
  action: string;
  /** Lets the highlighted control receive clicks; everything else is blocked. */
  interactive?: boolean;
  practice?: Practice;
};

const TOUR_STEPS: TourStep[] = [
  {
    route: "/generate",
    eyebrow: "Welcome",
    title: "This is your private beat-to-YouTube studio",
    body: "BeatFlow turns an MP3 and a cover photo into a 1080p MP4, then walks that video to YouTube with the metadata and schedule you approve. Rendering happens on this device. Uploading happens only when you press the upload button.",
    action: "The tour jumps to the real control for each step and waits while you try it. Use Next or the arrow keys when you are ready. Escape pauses; you can resume from the button in the corner.",
  },
  {
    route: "/generate",
    selector: "[data-tour='render-template']",
    eyebrow: "01 · Design",
    title: "Choose your visual signature",
    body: "First Light, Pulse, Grid, and Orbital are complete 1920 × 1080 compositions. The preview updates the moment you pick one. Orbital is the animated, audio-reactive design; the other three are still frames with a photo.",
    action: "Pick a template on the right. Your first choice is a starting point, not a permanent lock.",
    interactive: true,
    practice: {
      instruction: "Click Orbital in the template list to see the animated design.",
      success: "Orbital selected. The preview is now audio-reactive and capped at 5 minutes.",
      check: (doc) =>
        Boolean(doc.querySelector("[data-tour='render-template'] input[value='orbital']:checked")),
    },
  },
  {
    route: "/generate",
    selector: "#render-audio",
    eyebrow: "02 · Source",
    title: "Bring in the beat",
    body: "Select an MP3 or WAV. BeatFlow reads it locally, uses the filename as a starting track title, and analyses the waveform for Orbital. Static designs accept up to 15 minutes; Orbital accepts up to 5.",
    action: "Choose a short track for your first run. Nothing is uploaded at this step.",
    interactive: true,
    practice: {
      instruction: "Choose an audio file to unlock rendering.",
      success: "Track loaded. The title field below is prefilled from the filename.",
      check: (doc) => hasFile(doc, "#render-audio"),
    },
  },
  {
    route: "/generate",
    selector: "#render-image",
    eyebrow: "03 · Artwork",
    title: "Set the atmosphere",
    body: "First Light, Pulse, and Grid need a background photo. Orbital can run without one. Images are decoded and downscaled to the canvas in this tab; rendering never sends them anywhere.",
    action: "Add a photo if your template needs one. A wide, high-contrast image works best behind text.",
    interactive: true,
    practice: {
      instruction: "Add a background photo, or skip this practice if you chose Orbital.",
      success: "Artwork ready. Its colours drive the composition in the preview.",
      check: (doc) => hasFile(doc, "#render-image"),
    },
  },
  {
    route: "/generate",
    selector: "#render-track-name",
    eyebrow: "04 · In the frame",
    title: "Name the track inside the video",
    body: "This is artwork text, not the YouTube title. It is suggested from the audio filename and can be edited freely. BPM, key, and the message line appear on Orbital.",
    action: "Type a track name and watch the preview follow it.",
    interactive: true,
    practice: {
      instruction: "Type a track name and watch the preview follow it.",
      success: "That is exactly how the title will appear in the rendered frame.",
      watchValue: "#render-track-name",
    },
  },
  {
    route: "/generate",
    selector: "[data-tour='render-button']",
    eyebrow: "05 · Make the video",
    title: "Render privately on this device",
    body: "Render MP4 builds the video in this browser. Nothing is uploaded. A long render needs this tab open, and the result is held in memory until you render again or discard it.",
    action: "Try a short track first. Keep this tab open until the progress bar finishes.",
    interactive: true,
    practice: {
      instruction: "Click Render MP4 to watch the progress. The button unlocks after a track is added.",
      success: "Rendering started. You can preview, download, or hand the MP4 to the upload desk.",
      watchClick: "[data-tour='render-button']",
    },
  },
  {
    route: "/generate",
    selector: "[data-tour='video-file']",
    eyebrow: "06 · Release",
    title: "Choose what to send to YouTube",
    body: "The upload desk accepts an MP4: the video you just rendered, one you exported earlier, or the included sample. Rendering and uploading are separate actions, so you can prepare the form without publishing anything.",
    action: "Drop an MP4 here, or use the Sample MP4 link to explore the form safely.",
    interactive: true,
    practice: {
      instruction: "Drop the rendered MP4 into this box to fill the upload form.",
      success: "Video attached. The upload title is prefilled from the filename.",
      check: (doc) => hasFile(doc, "#video-file"),
    },
  },
  {
    route: "/generate",
    selector: "#video-description",
    eyebrow: "07 · Tell the story",
    title: "Your description lives here",
    body: "Paste credits, tracklist, licensing details, or links. The counter measures YouTube's 5,000-byte limit as you type. Your saved starting description is prefilled and can be rewritten for this release.",
    action: "Paste a short description now. It is only sent if you later press Start upload.",
    interactive: true,
    practice: {
      instruction: "Paste or type in this box — even a few words is enough.",
      success: "That is your description. The byte counter updates beside the field label.",
      watchValue: "#video-description",
    },
  },
  {
    route: "/generate",
    selector: "#video-tags",
    eyebrow: "08 · Findability",
    title: "Add tags to describe the release",
    body: "Type a tag and press Enter or comma to add it. Tags help categorize the video but do not guarantee discovery. Your default tags are loaded automatically and can be removed here.",
    action: "Add one tag to feel the control. Backspace removes the last tag.",
    interactive: true,
    practice: {
      instruction: "Add a tag and press Enter. Existing default tags are already here.",
      success: "Tag added. It will be submitted with the upload.",
      watchTags: "#video-tags",
    },
  },
  {
    route: "/generate",
    selector: "#video-schedule",
    eyebrow: "09 · Pick the moment",
    title: "Schedule a release",
    body: "Pick a future local date and time. BeatFlow converts that wall time in your working timezone to UTC and keeps the upload private until YouTube publishes it. Times less than 10 minutes away are rejected.",
    action: "Choose a future time. Clear the field to publish with immediate visibility instead.",
    interactive: true,
    practice: {
      instruction: "Pick a different date and time. Clear the field to publish immediately instead.",
      success: "Scheduled. The UTC instant and private-until-publish badge appear below.",
      watchValue: "#video-schedule",
    },
  },
  {
    route: "/generate",
    selector: "[data-tour='upload-submit']",
    eyebrow: "10 · Your approval",
    title: "Nothing publishes without your click",
    body: "This is the final hand-off. Review the MP4, title, description, tags, visibility, and schedule first. Start upload sends the file from this browser to Google. YouTube, not this browser, handles processing and publication.",
    action: "Do not press this during the tour unless you intend to upload. Use the sample MP4 for a deliberate test.",
    interactive: false,
  },
  {
    route: "/settings",
    selector: "#producer-name",
    eyebrow: "11 · Make it yours",
    title: "Set reusable producer defaults",
    body: "Producer name seeds artwork, timezone drives schedule conversion, and tags plus the starting description prefill every new upload. Preferred immediate visibility controls unscheduled releases. Everything is stored in this browser.",
    action: "Change any preference, then press Save settings. Each release can still override these defaults.",
    interactive: true,
    practice: {
      instruction: "Edit your producer name, then press Save settings.",
      success: "That name is your default. Press Save settings to keep it for the next upload.",
      check: (doc) => producerNameChanged(doc, readSettings().producerName),
      watchValue: "#producer-name",
    },
  },
  {
    route: "/templates",
    selector: "[data-tour='template-library']",
    eyebrow: "12 · Build a look",
    title: "Create a reusable visual identity",
    body: "My Templates holds presets and blank canvases. Edit text and layers, set producer branding, and save designs locally. Export a .beatflow.json backup to move a template to another browser.",
    action: "Pick a preset after the tour. Unsaved edits are guarded, and approved batch snapshots stay unchanged.",
    interactive: false,
  },
  {
    route: "/batch",
    selector: "[data-tour='batch-files']",
    eyebrow: "13 · Work in batches",
    title: "Plan several releases together",
    body: "Add multiple audio files and choose a saved design. BeatFlow previews a calendar, skips known reserved slots, and lets you review each track before approval.",
    action: "Nothing enters the queue until you approve the displayed batch.",
    interactive: true,
    practice: {
      instruction: "Add two or more beats to build a batch.",
      success: "Tracks added. Each one now has its own title, design, and date.",
      check: (doc) => hasFile(doc, "[data-tour='batch-files']"),
    },
  },
  {
    route: "/batch",
    selector: "[data-tour='batch-schedule']",
    eyebrow: "14 · Set your rhythm",
    title: "Choose weekly release slots",
    body: "Set the first eligible date, an IANA timezone, and one or more weekly day/time slots. Each track takes the next free slot. Daylight-saving gaps and ambiguous wall times are skipped rather than guessed.",
    action: "These rules only prepare a calendar; nothing is uploaded while you choose them.",
    interactive: true,
  },
  {
    route: "/batch",
    selector: "#batch-dates",
    eyebrow: "15 · Review the calendar",
    title: "Generate dates, then inspect them",
    body: "The preview assigns a date and local time to every track without contacting YouTube. Check each title, description, tags, artwork, design, and publication time before approval.",
    action: "Add tracks first, then press Generate calendar preview. Empty dates are safe to explore.",
    interactive: true,
  },
  {
    route: "/batch",
    selector: "#batch-approve",
    eyebrow: "16 · Approve deliberately",
    title: "Approval saves an immutable snapshot",
    body: "Approving stores the design and local media for each track, so later template edits cannot silently change queued releases. Export-only batches are available too; uploading needs an explicit setting.",
    action: "Approval asks for confirmation and does not itself start the queue.",
    interactive: false,
  },
  {
    route: "/batch",
    selector: "#batch-start",
    eyebrow: "17 · Run the queue",
    title: "Start only when you are ready",
    body: "The queue renders and uploads one approved job at a time. Keep this tab open. Pause and resume are supported, and an uncertain upload outcome must be reconciled in YouTube Studio rather than blindly retried.",
    action: "Start approved queue is the action that begins batch work. It stays untouched during the tour.",
    interactive: false,
  },
  {
    route: "/history",
    selector: "[data-tour='upload-history']",
    eyebrow: "18 · Keep track",
    title: "History records what BeatFlow knows",
    body: "Review locally recorded uploads and refresh their status from YouTube. A requested schedule or visibility is not proof of publication — rely on a confirmed YouTube status and YouTube Studio when certainty matters.",
    action: "History lives in this browser. Export backups where offered and avoid clearing site data.",
    interactive: false,
  },
  {
    route: "/generate",
    eyebrow: "Done",
    title: "You know the whole flow now",
    body: "Design, render, describe, schedule, upload. Batch and templates are there when one release at a time stops scaling. The walkthrough stays in the corner whenever you want to revisit a step.",
    action: "Start with a short track and a real MP4 render. Nothing leaves this browser until you approve an upload.",
  },
];

function recommendedPreferences(existing: ProducerSettings): ProducerSettings {
  return {
    ...existing,
    timezone: existing.timezone.trim() || browserTimeZone(),
    defaultTags: [...existing.defaultTags],
    defaultVisibility: "unlisted",
  };
}

function sameRect(a: MeasuredRect, b: MeasuredRect): boolean {
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function pointerRotation(direction: "up" | "down" | "left" | "right"): string | undefined {
  switch (direction) {
    case "down":
      return "rotate(180 12 12)";
    case "left":
      return "rotate(-90 12 12)";
    case "right":
      return "rotate(90 12 12)";
    default:
      return undefined;
  }
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function OnboardingExperience() {
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [initialState] = useState(() => {
    const stored = readOnboardingProgress();
    const settings = readSettings();
    return {
      progress: stored,
      preferences: { ...settings, timezone: settings.timezone || browserTimeZone() },
      mode: stored.setupComplete ? ("closed" as const) : ("setup" as const),
      step: Math.min(stored.tourStep, TOUR_STEPS.length - 1),
    };
  });
  const [progress, setProgress] = useState<OnboardingProgress>(initialState.progress);
  const [preferences, setPreferences] = useState<ProducerSettings>(initialState.preferences);
  const [mode, setMode] = useState<"closed" | "setup" | "tour">(initialState.mode);
  const [setupPage, setSetupPage] = useState(0);
  const [stepIndex, setStepIndex] = useState(initialState.step);
  const [tagsText, setTagsText] = useState(() => initialState.preferences.defaultTags.join(", "));
  const [saveError, setSaveError] = useState("");
  const [target, setTarget] = useState<{
    step: number;
    rect: MeasuredRect | null;
    missing: boolean;
  } | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<ReadonlySet<number>>(() => new Set());
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const tooltipRef = useRef<HTMLElement | null>(null);
  const setupRef = useRef<HTMLDivElement | null>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});

  const current = TOUR_STEPS.at(stepIndex);
  const stepCount = TOUR_STEPS.length;
  const interactive = Boolean(current?.selector) && current?.interactive === true;

  useEffect(() => {
    if (mode !== "tour") return;
    const step = TOUR_STEPS.at(stepIndex);
    if (!step) return;
    if (pathname !== step.route) {
      router.push(step.route);
      return;
    }
    if (!step.selector) return;

    const selector = step.selector;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    let timer = 0;
    let attempts = 0;

    const markMissing = () =>
      setTarget((previous) =>
        previous?.step === stepIndex && previous.missing
          ? previous
          : { step: stepIndex, rect: null, missing: true },
      );

    const measure = () => {
      if (cancelled) return;
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        markMissing();
        return;
      }
      const box = element.getBoundingClientRect();
      const nextRect = { left: box.left, top: box.top, width: box.width, height: box.height };
      setTarget((previous) =>
        previous?.step === stepIndex &&
        previous.rect &&
        !previous.missing &&
        sameRect(previous.rect, nextRect)
          ? previous
          : { step: stepIndex, rect: nextRect, missing: false },
      );
    };

    const locate = () => {
      if (cancelled) return;
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        if (attempts++ < 40) {
          timer = window.setTimeout(locate, 100);
          return;
        }
        markMissing();
        return;
      }
      element.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
      });
      timer = window.setTimeout(measure, reduced ? 40 : 300);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 90);
    };

    locate();
    // Pages reflow when a template or file changes; keep the hole on the control.
    const refresh = window.setInterval(measure, 600);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
      window.clearTimeout(timer);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [mode, pathname, stepIndex, router]);

  useEffect(() => {
    if (mode !== "tour") return;
    const practice = TOUR_STEPS.at(stepIndex)?.practice;
    if (!practice) return;

    let cancelled = false;
    const baseline = captureBaseline(practice, document);
    const markDone = () =>
      setCompletedSteps((previous) =>
        previous.has(stepIndex) ? previous : new Set(previous).add(stepIndex),
      );
    const observe = () => {
      if (!cancelled && practiceSatisfied(practice, baseline, document)) markDone();
    };
    observe();
    const interval = window.setInterval(observe, 400);
    const events = ["input", "change", "keyup", "click"] as const;
    for (const name of events) document.addEventListener(name, observe, true);
    const onClick = (event: MouseEvent) => {
      if (!practice.watchClick) return;
      const target = event.target as Element | null;
      if (target?.closest(practice.watchClick)) markDone();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      for (const name of events) document.removeEventListener(name, observe, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [mode, stepIndex]);

  useEffect(() => {
    if (mode !== "tour") return;
    const timer = window.setTimeout(() => headingRef.current?.focus(), 90);
    return () => window.clearTimeout(timer);
  }, [mode, stepIndex]);

  // Keeps keyboard focus inside the first-run dialog while it is open.
  useEffect(() => {
    if (mode !== "setup") return;
    const dialog = setupRef.current;
    if (!dialog) return;
    const selector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      [...dialog.querySelectorAll<HTMLElement>(selector)].filter(
        (element) => element.getClientRects().length > 0,
      );
    const timer = window.setTimeout(() => {
      const preferred = dialog.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
      );
      (preferred ?? focusable()[0])?.focus();
    }, 80);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Focus can start on the page behind the dialog; pull it back in first.
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    // The dialog mounts only after the client gate flips, so mode alone is not enough.
  }, [mode, mounted]);

  // Hands-off stops block page interaction, so Tab must stay in the card too.
  useEffect(() => {
    if (mode !== "tour" || interactive) return;
    const dialog = tooltipRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [mode, mounted, interactive, stepIndex]);

  // The real card height decides whether it can sit below or above the target.
  useEffect(() => {
    if (mode !== "tour") return;
    const element = tooltipRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setTooltipHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [mode, stepIndex]);

  function persist(next: OnboardingProgress) {
    try {
      writeOnboardingProgress(next);
      setProgress(next);
      setSaveError("");
    } catch {
      setProgress(next);
      setSaveError("This browser blocked local storage, so your tour position cannot be remembered.");
    }
  }

  function goToStep(index: number) {
    const safe = Math.max(0, Math.min(index, stepCount - 1));
    setStepIndex(safe);
    persist({ ...progress, setupComplete: true, tourComplete: false, tourStep: safe });
  }

  function advanceTour() {
    if (stepIndex + 1 >= stepCount) {
      persist({ ...progress, setupComplete: true, tourComplete: true, tourStep: stepCount });
      setMode("closed");
      return;
    }
    goToStep(stepIndex + 1);
  }

  function previousStep() {
    if (stepIndex > 0) goToStep(stepIndex - 1);
  }

  function pauseTour() {
    persist({ ...progress, setupComplete: true, tourComplete: false, tourStep: stepIndex });
    setMode("closed");
  }

  function skipTour() {
    persist({ ...progress, setupComplete: true, tourComplete: true, tourStep: stepCount });
    setMode("closed");
  }

  function startTour(index = 0) {
    const safe = Math.max(0, Math.min(index, stepCount - 1));
    setStepIndex(safe);
    // Starting from the welcome step is always a fresh playthrough.
    if (safe === 0) setCompletedSteps(new Set());
    setSaveError("");
    setMode("tour");
    persist({ ...progress, setupComplete: true, tourComplete: false, tourStep: safe });
  }

  function dismissSetup() {
    persist({ ...progress, setupComplete: true, tourComplete: false, tourStep: 0 });
    setMode("closed");
  }

  function finishSetup(useDefaults: boolean) {
    setSaveError("");
    const existing = readSettings();
    const next = useDefaults
      ? recommendedPreferences(existing)
      : {
          ...preferences,
          producerName: preferences.producerName.trim(),
          timezone: preferences.timezone.trim(),
          defaultTags: tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          descriptionTemplate: preferences.descriptionTemplate.trim(),
        };
    if (!validTimeZone(next.timezone)) {
      setSaveError("Enter a valid timezone, for example Africa/Lagos, America/New_York, or UTC.");
      setSetupPage(0);
      return;
    }
    try {
      writeSettings(next);
      writeOnboardingProgress({ setupComplete: true, tourComplete: false, tourStep: 0 });
      setPreferences(next);
      setTagsText(next.defaultTags.join(", "));
      setProgress({ setupComplete: true, tourComplete: false, tourStep: 0 });
      setStepIndex(0);
      setCompletedSteps(new Set());
      setMode("tour");
    } catch {
      setSaveError(
        "BeatFlow could not save these preferences in this browser. Check storage permissions and try again.",
      );
    }
  }

  function handleKey(event: KeyboardEvent) {
    if (mode === "setup") {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissSetup();
      }
      return;
    }
    if (mode !== "tour") return;
    if (event.key === "Escape") {
      event.preventDefault();
      pauseTour();
      return;
    }
    const target = event.target as HTMLElement | null;
    const typing =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "SELECT" ||
      target?.isContentEditable;
    if (typing) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      advanceTour();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousStep();
    }
  }

  useEffect(() => {
    keyHandlerRef.current = handleKey;
  });
  useEffect(() => {
    if (mode === "closed") return;
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [mode]);

  useEffect(() => {
    const open = (event: Event) => {
      const restart = (event as CustomEvent<{ restart?: boolean }>).detail?.restart;
      const stored = readOnboardingProgress();
      if (!stored.setupComplete) {
        setSetupPage(0);
        setMode("setup");
        return;
      }
      const nextStep = restart ? 0 : Math.min(stored.tourStep, TOUR_STEPS.length - 1);
      setStepIndex(nextStep);
      if (nextStep === 0) setCompletedSteps(new Set());
      setMode("tour");
      try {
        writeOnboardingProgress({
          setupComplete: true,
          tourComplete: false,
          tourStep: nextStep,
        });
        setProgress({ setupComplete: true, tourComplete: false, tourStep: nextStep });
        setSaveError("");
      } catch {
        setSaveError("This browser blocked local storage, so your tour position cannot be remembered.");
      }
    };
    window.addEventListener("beatflow:onboarding", open);
    return () => window.removeEventListener("beatflow:onboarding", open);
  }, []);

  if (!mounted) return null;

  const practiceDone = completedSteps.has(stepIndex);
  const onStepRoute = Boolean(current) && pathname === current?.route;
  const activeTarget = target?.step === stepIndex ? target : null;
  const activeLayout =
    activeTarget?.rect && current?.selector && !activeTarget.missing && onStepRoute
      ? measuredLayout(
          activeTarget.rect,
          { width: window.innerWidth, height: window.innerHeight },
          stepIndex,
          tooltipHeight,
        )
      : activeTarget?.missing
        ? missingLayout(stepIndex)
        : null;
  const rect = activeLayout?.missing || !onStepRoute ? null : (activeLayout?.rect ?? null);
  const pad = 7;
  const hole = rect
    ? {
        left: Math.max(0, rect.left - pad),
        top: Math.max(0, rect.top - pad),
        right: Math.min(window.innerWidth, rect.left + rect.width + pad),
        bottom: Math.min(window.innerHeight, rect.top + rect.height + pad),
      }
    : null;

  return (
    <>
      {mode === "closed" ? (
        <button
          type="button"
          onClick={() => {
            if (!progress.setupComplete) {
              setMode("setup");
              return;
            }
            startTour(progress.tourComplete ? 0 : progress.tourStep);
          }}
          className="fixed bottom-20 right-4 z-[70] inline-flex h-11 items-center gap-2 rounded-full border border-primary/35 bg-surface-container-low px-4 text-xs font-semibold text-primary shadow-xl transition hover:bg-surface-container-high md:bottom-5 md:right-6"
          aria-label={
            !progress.setupComplete
              ? "Open BeatFlow setup"
              : progress.tourComplete
                ? "Replay the BeatFlow walkthrough"
                : "Resume the BeatFlow walkthrough"
          }
        >
          <Icon name="info" className="h-4 w-4" />
          {!progress.setupComplete
            ? "Get started"
            : progress.tourComplete
              ? "Walkthrough"
              : "Resume tour"}
        </button>
      ) : null}

      {mode === "setup" ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div
            ref={setupRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-x-hidden overflow-y-auto overscroll-contain rounded-[28px] border border-outline-variant bg-surface-container-low shadow-2xl"
          >
            <div className="relative overflow-hidden border-b border-outline-variant px-6 py-7 sm:px-9 sm:py-9">
              <div aria-hidden className="studio-atmosphere pointer-events-none absolute inset-0 opacity-80" />
              <div className="relative flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                  <Icon name="studio" className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">
                    Your private release workstation
                  </p>
                  <h1 id="onboarding-title" className="mt-1 text-2xl font-semibold sm:text-3xl">
                    Make BeatFlow feel like yours.
                  </h1>
                </div>
              </div>
              <p className="relative mt-4 max-w-2xl text-sm leading-6 text-on-surface-variant">
                Three quick questions set the defaults you will reuse on every release. Then a
                hands-on tour walks the real controls: artwork, render, description, schedule, and
                upload.
              </p>
              <div className="relative mt-6 flex gap-2" role="group" aria-label="Setup progress">
                {["Your profile", "Release defaults", "Publishing style"].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSetupPage(index)}
                    aria-current={setupPage === index ? "step" : undefined}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2 text-left text-xs transition",
                      setupPage === index
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-outline-variant bg-surface-container-low/70 text-on-surface-variant hover:border-outline",
                    )}
                  >
                    <span className="font-mono">0{index + 1}</span>
                    <span className="ml-2 hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_230px] sm:p-9">
              <div className="flex flex-col gap-4">
                {setupPage === 0 ? (
                  <>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[.16em] text-outline">
                        Identity &amp; time
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">What should your releases say?</h2>
                      <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                        These choices stay in this browser. They prepare uploads; they never publish
                        by themselves.
                      </p>
                    </div>
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-on-surface-variant">
                      Producer / artist name
                      <Input
                        autoFocus
                        value={preferences.producerName}
                        maxLength={80}
                        placeholder="e.g. Nova Beats"
                        onChange={(event) =>
                          setPreferences({ ...preferences, producerName: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-on-surface-variant">
                      Working timezone
                      <Input
                        value={preferences.timezone}
                        list="onboarding-timezones"
                        placeholder="Africa/Lagos"
                        onChange={(event) =>
                          setPreferences({ ...preferences, timezone: event.target.value })
                        }
                      />
                      <datalist id="onboarding-timezones">
                        {[
                          "UTC",
                          "Africa/Lagos",
                          "Africa/Johannesburg",
                          "America/New_York",
                          "America/Chicago",
                          "America/Los_Angeles",
                          "Europe/London",
                          "Europe/Berlin",
                          "Asia/Tokyo",
                          "Australia/Sydney",
                        ].map((zone) => (
                          <option key={zone} value={zone} />
                        ))}
                      </datalist>
                      <span className="text-[11px] font-normal text-outline">
                        Schedule fields display this zone. Current browser zone: {browserTimeZone()}.
                      </span>
                    </label>
                  </>
                ) : null}

                {setupPage === 1 ? (
                  <>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[.16em] text-outline">
                        Save typing next time
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">Choose your starting metadata.</h2>
                      <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                        Defaults prefill new uploads and batch drafts. Every release can still be
                        personalised before it leaves the browser.
                      </p>
                    </div>
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-on-surface-variant">
                      Default tags · comma separated
                      <Input
                        value={tagsText}
                        placeholder="afrobeats, instrumental, type beat"
                        onChange={(event) => setTagsText(event.target.value)}
                      />
                      <span className="text-[11px] font-normal text-outline">
                        Use descriptive tags you actually want on your releases.
                      </span>
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-on-surface-variant">
                      Starting description
                      <Textarea
                        rows={5}
                        maxLength={5000}
                        value={preferences.descriptionTemplate}
                        placeholder={
                          "Produced by [your name]\nCredits, tracklist, licensing details, and links…"
                        }
                        onChange={(event) =>
                          setPreferences({
                            ...preferences,
                            descriptionTemplate: event.target.value,
                          })
                        }
                      />
                      <span className="text-[11px] font-normal text-outline">
                        A starting draft—not a magic template. Replace bracketed notes per release.
                      </span>
                    </label>
                  </>
                ) : null}

                {setupPage === 2 ? (
                  <>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[.16em] text-outline">
                        Visibility &amp; care
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        How should a new release start?
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                        Pick a safe default for uploads without a schedule. A scheduled video is
                        always private until its publish time.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          {
                            value: "unlisted",
                            title: "Unlisted first",
                            detail: "Recommended · check the video before sharing",
                          },
                          {
                            value: "public",
                            title: "Public immediately",
                            detail: "For releases ready to go live now",
                          },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={preferences.defaultVisibility === option.value}
                          onClick={() =>
                            setPreferences({ ...preferences, defaultVisibility: option.value })
                          }
                          className={cn(
                            "rounded-2xl border p-4 text-left transition",
                            preferences.defaultVisibility === option.value
                              ? "border-primary bg-primary/10"
                              : "border-outline-variant bg-surface-container-lowest hover:border-outline",
                          )}
                        >
                          <span className="text-sm font-semibold">{option.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-on-surface-variant">
                            {option.detail}
                          </span>
                        </button>
                      ))}
                    </div>
                    <Card className="p-4">
                      <div className="flex gap-3">
                        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p className="text-xs leading-5 text-on-surface-variant">
                          Rendering happens on this device. Uploading starts only when you press the
                          upload button. Preferences, templates, history, and batch files are
                          browser-local—export template backups and keep your own media copies.
                        </p>
                      </div>
                    </Card>
                  </>
                ) : null}

                {saveError ? (
                  <p role="alert" className="text-sm text-error">
                    {saveError}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => (setupPage > 0 ? setSetupPage(setupPage - 1) : dismissSetup())}
                  >
                    {setupPage > 0 ? "Back" : "Later"}
                  </Button>
                  {setupPage < 2 ? (
                    <Button type="button" onClick={() => setSetupPage(setupPage + 1)}>
                      Next <Icon name="arrowRight" className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button type="button" onClick={() => finishSetup(false)}>
                      <Icon name="check" className="h-4 w-4" />
                      Save &amp; start the tour
                    </Button>
                  )}
                </div>
                <button
                  type="button"
                  className="self-start text-xs text-outline underline decoration-outline/50 underline-offset-4 hover:text-on-surface-variant"
                  onClick={() => finishSetup(true)}
                >
                  Skip setup and use recommended defaults
                </button>
              </div>

              <aside className="hidden flex-col gap-3 sm:flex">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Icon name="music" className="h-4 w-4" />
                    <span className="font-mono text-[10px] uppercase tracking-[.15em]">
                      What the tour covers
                    </span>
                  </div>
                  <ol className="mt-3 space-y-3 text-xs text-on-surface-variant">
                    <li>
                      <b className="text-on-surface">01</b> · Design a 1080p beat video
                    </li>
                    <li>
                      <b className="text-on-surface">02</b> · Render it on this device
                    </li>
                    <li>
                      <b className="text-on-surface">03</b> · Write description and tags
                    </li>
                    <li>
                      <b className="text-on-surface">04</b> · Schedule, then approve
                    </li>
                    <li>
                      <b className="text-on-surface">05</b> · Batch releases on a rhythm
                    </li>
                  </ol>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-tertiary">
                    <Icon name="clock" className="h-4 w-4" />
                    <span className="font-mono text-[10px] uppercase tracking-[.15em]">
                      About 6 minutes
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                    Each stop highlights the real control and waits while you try it. Pause anytime;
                    the next visit resumes where you left off.
                  </p>
                </Card>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "tour" && current ? (
        <div className="pointer-events-none fixed inset-0 z-[80]" aria-label="BeatFlow guided walkthrough">
          {interactive && hole ? (
            <>
              <div
                aria-hidden
                className="pointer-events-auto fixed bg-[rgb(4_4_8/0.74)]"
                style={{ left: 0, top: 0, width: "100%", height: hole.top }}
              />
              <div
                aria-hidden
                className="pointer-events-auto fixed bg-[rgb(4_4_8/0.74)]"
                style={{ left: 0, top: hole.bottom, width: "100%", height: window.innerHeight - hole.bottom }}
              />
              <div
                aria-hidden
                className="pointer-events-auto fixed bg-[rgb(4_4_8/0.74)]"
                style={{ left: 0, top: hole.top, width: hole.left, height: hole.bottom - hole.top }}
              />
              <div
                aria-hidden
                className="pointer-events-auto fixed bg-[rgb(4_4_8/0.74)]"
                style={{
                  left: hole.right,
                  top: hole.top,
                  width: window.innerWidth - hole.right,
                  height: hole.bottom - hole.top,
                }}
              />
            </>
          ) : (
            <div aria-hidden className="pointer-events-auto fixed inset-0 bg-[rgb(4_4_8/0.78)]" />
          )}

          {hole ? (
            <div
              aria-hidden
              className="onboarding-spotlight pointer-events-none fixed rounded-2xl border-2 border-primary"
              style={{
                left: hole.left,
                top: hole.top,
                width: hole.right - hole.left,
                height: hole.bottom - hole.top,
              }}
            />
          ) : null}

          <div
            className="pointer-events-auto fixed max-h-[calc(100dvh-2rem)]"
            style={
              activeLayout && current.selector && !activeLayout.missing
                ? {
                    left: activeLayout.tooltip.left,
                    top: activeLayout.tooltip.top,
                    width: activeLayout.tooltip.width,
                  }
                : {
                    left: "50%",
                    top: "50%",
                    width: `min(32rem, calc(100vw - 2rem))`,
                    transform: "translate(-50%, -50%)",
                  }
            }
          >
            {activeLayout?.pointer && current.selector && !activeLayout.missing ? (
              <span
                aria-hidden
                className={cn(
                  "onboarding-pointer absolute text-primary",
                  activeLayout.pointer.direction === "up" && "onboarding-pointer-up -top-7",
                  activeLayout.pointer.direction === "down" && "onboarding-pointer-down -bottom-7",
                  activeLayout.pointer.direction === "left" && "onboarding-pointer-left -left-7",
                  activeLayout.pointer.direction === "right" && "onboarding-pointer-right -right-7",
                )}
                style={
                  activeLayout.pointer.direction === "left" ||
                  activeLayout.pointer.direction === "right"
                    ? { top: (activeLayout.pointer.top ?? 26) - 11 }
                    : { left: (activeLayout.pointer.left ?? 26) - 11 }
                }
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path
                    d="M12 20V4M5 11l7-7 7 7"
                    transform={pointerRotation(activeLayout.pointer.direction)}
                  />
                </svg>
              </span>
            ) : null}

            <section
              ref={tooltipRef}
              role="dialog"
              aria-modal={interactive ? undefined : true}
              aria-labelledby="tour-title"
              aria-describedby="tour-body"
              className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-primary/35 bg-surface-container-low p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">
                    {current.eyebrow}
                  </p>
                  <h2
                    id="tour-title"
                    ref={headingRef}
                    tabIndex={-1}
                    className="mt-1 text-lg font-semibold leading-snug outline-none"
                  >
                    {current.title}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Pause walkthrough"
                  onClick={pauseTour}
                  className="rounded-lg p-2 text-outline transition hover:bg-surface-container-high hover:text-on-surface"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>

              <p id="tour-body" className="mt-3 text-sm leading-6 text-on-surface-variant">
                {current.body}
              </p>

              <div className="mt-3 flex gap-2 rounded-xl border border-tertiary/20 bg-tertiary-container/10 p-3">
                <span className="tour-arrow mt-0.5 text-tertiary" aria-hidden>
                  ↗
                </span>
                <p className="text-xs leading-5 text-on-surface-variant">{current.action}</p>
              </div>

              {current.practice ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "mt-3 rounded-xl border p-3 transition",
                    practiceDone
                      ? "border-primary/50 bg-primary/10"
                      : "border-outline-variant bg-surface-container-lowest/70",
                  )}
                >
                  <p
                    className={cn(
                      "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.15em]",
                      practiceDone ? "text-primary" : "text-tertiary",
                    )}
                  >
                    <Icon name={practiceDone ? "check" : "spark"} className="h-3.5 w-3.5" />
                    {practiceDone ? "Nice — practice complete" : "Your turn"}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-on-surface-variant">
                    {practiceDone ? current.practice.success : current.practice.instruction}
                  </p>
                </div>
              ) : null}

              {activeLayout?.missing ? (
                <p role="status" className="mt-3 text-xs leading-5 text-tertiary">
                  This control is not on screen yet. Keep going, or pause and open the page from the
                  sidebar.
                </p>
              ) : null}

              {saveError ? (
                <p role="alert" className="mt-3 text-xs leading-5 text-error">
                  {saveError}
                </p>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] text-outline">
                  {stepIndex + 1} / {stepCount}
                </span>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={pauseTour}>
                    Pause
                  </Button>
                  {stepIndex === 0 ? null : (
                    <Button type="button" variant="ghost" size="sm" onClick={previousStep}>
                      Back
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={skipTour}>
                    Finish tour
                  </Button>
                  <Button type="button" size="sm" onClick={advanceTour}>
                    {stepIndex === stepCount - 1 ? "Finish" : "Next"}
                    <Icon name="arrowRight" className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1" aria-hidden="true">
                {TOUR_STEPS.map((step, index) => (
                  <span
                    key={`${step.route}-${step.title}`}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      index < stepIndex
                        ? "bg-primary/50"
                        : index === stepIndex
                          ? "bg-primary"
                          : "bg-surface-container-highest",
                    )}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
