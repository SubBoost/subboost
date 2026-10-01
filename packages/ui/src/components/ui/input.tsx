"use client";

import * as React from "react";
import { cn } from "@subboost/ui/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const isDateInput = type === "date";

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-field-border bg-field px-4 py-2 text-sm text-fg placeholder:text-fg-40 focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
          isDateInput &&
            "appearance-none [-webkit-appearance:none] [color-scheme:var(--date-input-scheme)] [-webkit-text-fill-color:var(--fg)] text-left [&::-webkit-datetime-edit]:text-fg [&::-webkit-datetime-edit]:text-left [&::-webkit-datetime-edit-fields-wrapper]:text-fg [&::-webkit-datetime-edit-text]:text-fg [&::-webkit-datetime-edit-month-field]:text-fg [&::-webkit-datetime-edit-day-field]:text-fg [&::-webkit-datetime-edit-year-field]:text-fg [&::-webkit-date-and-time-value]:text-fg [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:block [&::-webkit-date-and-time-value]:w-full [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
