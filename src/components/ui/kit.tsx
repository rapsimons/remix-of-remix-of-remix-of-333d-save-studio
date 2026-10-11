import { type ReactNode, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

export function Btn({
  icon,
  label,
  active,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; label?: string; active?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex select-none flex-col items-center justify-center gap-1 rounded-sm border border-hairline bg-background px-2.5 py-2 text-foreground transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-35",
        active && "bg-foreground text-background hover:bg-foreground",
        className,
      )}
    >
      {icon && <Icon name={icon} />}
      {label && <span className="label-caps leading-none">{label}</span>}
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="label-caps flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span>{Math.round(value * 100) / 100}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-px w-full appearance-none bg-hairline accent-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-foreground"
      />
    </label>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between border-b border-hairline py-2 label-caps text-muted-foreground"
    >
      <span>{label}</span>
      <span className={cn("size-3 border border-foreground", on && "bg-foreground")} />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center">
      <div
        className={cn(
          "flex max-h-[92svh] w-full flex-col border border-hairline bg-background sm:max-w-md",
          wide && "sm:max-w-2xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
          <span className="label-caps">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1">
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label-caps text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full border border-hairline bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground";

/** Tap-to-open drawer: only the header shows until it's needed. */
export function Drawer({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border border-hairline">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5"
      >
        <span className="label-caps">{title}</span>
        <span className={cn("text-xs text-muted-foreground transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && <div className="space-y-2 border-t border-hairline p-3">{children}</div>}
    </section>
  );
}
