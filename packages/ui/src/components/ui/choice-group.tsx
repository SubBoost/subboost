"use client";

import * as React from "react";
import { cn } from "@subboost/ui/lib/utils";

export interface ChoiceGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
}

const ChoiceGroup = React.forwardRef<HTMLDivElement, ChoiceGroupProps>(
  ({ label, className, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
);
ChoiceGroup.displayName = "ChoiceGroup";

export interface ChoiceChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  label: React.ReactNode;
  selected: boolean;
}

const ChoiceChip = React.forwardRef<HTMLButtonElement, ChoiceChipProps>(
  ({ label, selected, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary-500/50 bg-primary-500/20 text-white"
          : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
        className
      )}
      {...props}
    >
      {label}
    </button>
  )
);
ChoiceChip.displayName = "ChoiceChip";

export { ChoiceGroup, ChoiceChip };
