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
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-selected-border bg-selected text-selected-fg"
          : "border-btn-outline-border bg-btn-outline text-fg-60 shadow-(--btn-outline-shadow) hover:bg-btn-outline-hover hover:text-fg",
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
