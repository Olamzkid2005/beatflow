"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { Button, Card, cn, Input } from "@/components/ui/primitives";
import {
  completeOnboardingSetup,
  nextOnboardingProgress,
  readOnboardingProgress,
  writeOnboardingProgress,
  type OnboardingProgress,
} from "@/lib/onboarding";
import {
  captureBaseline,
  measuredLayout,
  missingLayout,
  practiceSatisfied,
  producerNameChanged,
  type MeasuredRect,
  type PracticeProbe,
} from "@/lib/onboarding-tour";
import { readSettings, type ProducerSettings } from "@/lib/settings";
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
    selector: "[data-tour='render-template']",
    eyebrow: "01 · Design & render",
    title: "Choose your visual style",
    body: "Pick a 1080p visual preset (First Light, Pulse, Grid, or audio-reactive Orbital), drop in your MP3 and cover art, and click Render MP4 right in this browser.",
    action: "Pick Orbital to preview the animated 30 fps style. Nothing is uploaded while you render.",
    interactive: true,
    practice: {
      instruction: "Click Orbital in the visual style list to see the animated design.",
      success: "Orbital selected. Add an MP3 whenever you are ready to render.",
      check: (doc) =>
        Boolean(doc.querySelector("[data-tour='render-template'] input[value='orbital']:checked")),
    },
  },
  {
    route: "/generate",
    selector: "#video-description",
    eyebrow: "02 · Release details",
    title: "Your description lives here",
    body: "Once your MP4 is ready, review the title, description, and tags for YouTube. Your saved defaults prefill automatically and can be customized per release.",
    action: "Type or paste a few words in the description box to try it out.",
    interactive: true,
    practice: {
      instruction: "Paste or type in this box — even a few words is enough.",
      success: "Description updated. The byte counter beside the label tracks YouTube's 5,000-byte limit.",
      watchValue: "#video-description",
    },
  },
  {
    route: "/generate",
    selector: "#video-schedule",
    eyebrow: "03 · Schedule",
    title: "Schedule a release",
    body: "Pick a future date and time in your working timezone. BeatFlow converts it to UTC and keeps the video private until YouTube publishes it. Clear the field to publish immediately.",
    action: "Choose a future date and time, or clear the field for immediate visibility.",
    interactive: true,
    practice: {
      instruction: "Pick a different date and time in the schedule input.",
      success: "Scheduled. The UTC time and private-until-publish note update below.",
      watchValue: "#video-schedule",
    },
  },
  {
    route: "/generate",
    selector: "[data-tour='upload-submit']",
    eyebrow: "04 · Publish",
    title: "Nothing publishes without your click",
    body: "Start upload sends the MP4 directly from this browser to Google. You can also use Batch mode in the top bar whenever you want to render and schedule multiple beats at once.",
    action: "This button is locked during the walkthrough so you never upload by accident.",
    interactive: false,
  },
  {
    route: "/settings",
    selector: "#producer-name",
    eyebrow: "05 · Defaults & templates",
    title: "Save reusable producer defaults",
    body: "Set your producer name, timezone, default tags, and description template here, or customize visual layouts in Templates. Everything stays in this browser.",
    action: "Edit your producer name or click Finish to start making videos.",
    interactive: true,
    practice: {
      instruction: "Edit your producer name, then press Save settings.",
      success: "Producer name updated. Press Save settings to keep it for future releases.",
      check: (doc) => producerNameChanged(doc, readSettings().producerName),
      watchValue: "#producer-name",
    },
  },
];

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
  const [stepIndex, setStepIndex] = useState(initialState.step);
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
    const next = nextOnboardingProgress(progress, "pause", stepCount, index);
    setStepIndex(next.tourStep);
    persist(next);
  }

  function advanceTour() {
    const next = nextOnboardingProgress(progress, "advance", stepCount, stepIndex);
    persist(next);
    if (next.tourComplete) {
      setMode("closed");
      return;
    }
    setStepIndex(next.tourStep);
  }

  function previousStep() {
    if (stepIndex > 0) goToStep(stepIndex - 1);
  }

  function pauseTour() {
    persist(nextOnboardingProgress(progress, "pause", stepCount, stepIndex));
    setMode("closed");
  }

  function skipTour() {
    persist(nextOnboardingProgress(progress, "skip", stepCount, stepIndex));
    setMode("closed");
  }

  function startTour(index?: number) {
    const next = nextOnboardingProgress(
      progress,
      index === undefined ? "start" : "resume",
      stepCount,
      index ?? progress.tourStep,
    );
    const safe = next.tourStep;
    setStepIndex(safe);
    // Starting from the welcome step is always a fresh playthrough.
    if (safe === 0) setCompletedSteps(new Set());
    setSaveError("");
    setMode("tour");
    persist(next);
  }

  function dismissSetup() {
    persist({ ...progress, setupComplete: true, tourComplete: false, tourStep: 0 });
    setMode("closed");
  }

  function finishSetup() {
    setSaveError("");
    const result = completeOnboardingSetup(preferences);
    if (!result.ok) {
      setSaveError(
        result.reason === "producer-name"
          ? "Add a producer or artist name to continue."
          : result.reason === "timezone"
            ? "Enter a valid timezone, for example Africa/Lagos, America/New_York, or UTC."
            : "BeatFlow could not save these preferences in this browser. Check storage permissions and try again.",
      );
      return;
    }
    setPreferences(result.settings);
    setProgress(result.progress);
    setStepIndex(result.progress.tourStep);
    setCompletedSteps(new Set());
    setMode("tour");
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
        setMode("setup");
        return;
      }
      const next = nextOnboardingProgress(
        stored,
        restart ? "start" : "resume",
        TOUR_STEPS.length,
      );
      setStepIndex(next.tourStep);
      if (next.tourStep === 0) setCompletedSteps(new Set());
      setMode("tour");
      try {
        writeOnboardingProgress(next);
        setProgress(next);
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
                Set the name shown on releases and confirm your scheduling timezone. You can change
                both later in Settings; optional defaults are available there too.
              </p>
            </div>

            <div className="grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_230px] sm:p-9">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.16em] text-outline">
                    Identity &amp; time
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">What should your releases say?</h2>
                  <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                    These choices stay in this browser. They prepare uploads; they never publish by
                    themselves.
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
                    id="onboarding-timezone"
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

                {saveError ? (
                  <p role="alert" className="text-sm text-error">
                    {saveError}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={dismissSetup}>
                    Later
                  </Button>
                  <Button type="button" onClick={() => finishSetup()}>
                    <Icon name="check" className="h-4 w-4" />
                    Save &amp; start the tour
                  </Button>
                </div>
              </div>

              <aside className="hidden flex-col gap-3 sm:flex">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Icon name="shield" className="h-4 w-4" />
                    <span className="font-mono text-[10px] uppercase tracking-[.15em]">
                      Ready when you are
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                    These required details are saved only in this browser. Tags, description and
                    upload visibility can be set later under Settings.
                  </p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-tertiary">
                    <Icon name="clock" className="h-4 w-4" />
                    <span className="font-mono text-[10px] uppercase tracking-[.15em]">
                      5 quick tour steps
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                    See how to create a video, review a release, and upload when you choose.
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
