"use client";

import * as React from "react";
import { Label } from "@subboost/ui/components/ui/label";
import { Switch } from "@subboost/ui/components/ui/switch";
import { cn } from "@subboost/ui/lib/utils";

export interface SwitchFieldProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  density?: "default" | "compact";
}

function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  density = "default",
}: SwitchFieldProps) {
  const generatedId = React.useId().replaceAll(":", "");
  const controlId = `switch-field-${generatedId}`;
  const labelId = `${controlId}-label`;
  const descriptionId = description ? `${controlId}-description` : undefined;

  return (
    <Label
      htmlFor={controlId}
      className={cn(
        "flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/[0.07]",
        density === "compact" ? "gap-2 rounded-md px-2 py-1" : "gap-4 px-4 py-3",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span className="min-w-0 space-y-1">
        <span
          id={labelId}
          className={cn(
            "block font-medium leading-snug text-white/80",
            density === "compact" ? "text-xs" : "text-sm"
          )}
        >
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="block text-xs font-normal leading-relaxed text-white/45">
            {description}
          </span>
        ) : null}
      </span>
      <Switch
        id={controlId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
      />
    </Label>
  );
}

export { SwitchField };
