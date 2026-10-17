import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { Icon } from "./icon";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const inputClass =
  "h-11 w-full rounded-xl border border-outline/60 bg-surface-container-lowest px-3 text-base text-on-surface shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] outline-none transition placeholder:text-outline focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm";

export const textareaClass =
  "w-full rounded-xl border border-outline/60 bg-surface-container-lowest p-3 text-base leading-6 text-on-surface shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] outline-none transition placeholder:text-outline focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-[0_12px_34px_-16px_rgba(148,125,255,0.85)] hover:bg-primary-container",
  secondary:
    "border border-surface-container-highest bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
  ghost: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
  outline:
    "border border-outline-variant bg-transparent text-on-surface hover:border-outline hover:bg-surface-container-high",
  danger:
    "border border-error/20 bg-error-container/25 text-error hover:bg-error-container/40 hover:text-on-error",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-xs sm:h-8",
  md: "h-11 px-4 text-sm sm:h-10",
  lg: "h-11 px-5 text-sm",
  icon: "h-11 w-11 p-0 sm:h-9 sm:w-9",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button className={buttonClass({ variant, size, className })} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-container-highest bg-surface-container-low/90 shadow-[0_24px_70px_-40px_rgba(0,0,0,0.9)]",
        className,
      )}
      {...props}
    />
  );
}

type BadgeTone = "neutral" | "primary" | "tertiary" | "success" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  primary: "bg-primary/15 text-primary",
  tertiary: "bg-tertiary-container/20 text-tertiary",
  success: "bg-emerald-500/10 text-emerald-300",
  danger: "bg-error-container/40 text-error",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[11px] font-medium tracking-wide",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint ? <span className="font-mono text-[10px] tracking-wide text-outline">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </div>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-[11px] font-medium uppercase tracking-[0.14em] text-on-surface-variant", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(textareaClass, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="relative">
      <select className={cn(inputClass, "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline"
      />
    </div>
  );
}

export function Progress({
  value,
  label,
  className,
  tone = "primary",
}: {
  value: number;
  label?: string;
  className?: string;
  tone?: "primary" | "tertiary";
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-label={label ?? "Progress"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-container-highest", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          tone === "tertiary"
            ? "bg-linear-to-r from-tertiary-container to-tertiary"
            : "bg-linear-to-r from-primary-container to-primary",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-on-surface-variant">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="peer sr-only"
      />
      <span className="relative h-5 w-9 rounded-full bg-surface-container-highest transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-on-surface after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-on-primary" />
      <span>{label}</span>
    </label>
  );
}

export function StatusDot({ tone = "primary" }: { tone?: "primary" | "tertiary" | "muted" | "danger" }) {
  const colors = {
    primary: "bg-primary",
    tertiary: "bg-tertiary",
    muted: "bg-outline",
    danger: "bg-error",
  };
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", colors[tone])} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-surface-container-highest bg-surface-container px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
      {children}
    </kbd>
  );
}
