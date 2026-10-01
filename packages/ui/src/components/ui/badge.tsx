"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@subboost/ui/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary-500/50 bg-primary-500/20 text-primary-200",
        secondary: "border-ink/15 bg-ink/5 text-fg-70",
        destructive: "border-red-500/50 bg-red-500/20 text-red-200",
        outline: "text-fg-70 border-ink/20 bg-transparent",
        success: "border-green-500/50 bg-green-500/10 text-green-300",
        warning: "border-yellow-500/50 bg-yellow-500/10 text-yellow-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
