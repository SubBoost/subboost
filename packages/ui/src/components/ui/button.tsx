"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@subboost/ui/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-btn-primary-border bg-btn-primary text-btn-primary-fg hover:bg-btn-primary-hover hover:border-btn-primary-border-hover shadow-(--btn-primary-shadow) hover:shadow-(--btn-primary-shadow-hover)",
        destructive:
          "border border-btn-danger-border bg-btn-danger text-btn-danger-fg hover:bg-btn-danger-hover hover:border-btn-danger-border-hover shadow-(--btn-danger-shadow) hover:shadow-(--btn-danger-shadow-hover)",
        outline:
          "border border-btn-outline-border bg-btn-outline hover:bg-btn-outline-hover text-btn-outline-fg hover:text-btn-outline-fg-hover shadow-(--btn-outline-shadow)",
        secondary:
          "bg-btn-outline hover:bg-btn-outline-hover text-btn-outline-fg hover:text-btn-outline-fg-hover border border-btn-outline-border shadow-(--btn-outline-shadow)",
        ghost: "hover:bg-ink/5 text-fg-60 hover:text-fg",
        link: "text-indigo-400 underline-offset-4 hover:underline hover:text-indigo-300",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
