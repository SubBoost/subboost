"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CircleHelp } from "lucide-react";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { cn } from "@subboost/ui/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;
const PopoverPortal = PopoverPrimitive.Portal;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 8, children, ...props }, ref) => (
  <PopoverPortal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={12}
      className={cn(
        "z-50 w-72 rounded-xl border border-white/15 bg-zinc-950/95 p-4 text-sm text-white/70 shadow-2xl shadow-black/40 outline-none backdrop-blur-xl",
        className
      )}
      {...props}
    >
      {children}
    </PopoverPrimitive.Content>
  </PopoverPortal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

const PopoverArrow = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow>
>(({ className, ...props }, ref) => (
  <PopoverPrimitive.Arrow
    ref={ref}
    className={cn("fill-zinc-950 stroke-white/15", className)}
    {...props}
  />
));
PopoverArrow.displayName = PopoverPrimitive.Arrow.displayName;

export interface HelpPopoverProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  side?: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>["side"];
  align?: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>["align"];
  sideOffset?: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>["sideOffset"];
}

function HelpPopover({
  label,
  children,
  className,
  contentClassName,
  side,
  align,
  sideOffset,
}: HelpPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          label={label}
          variant="ghost"
          className={cn("h-6 w-6 rounded-md text-white/40 hover:text-white/80", className)}
        >
          <CircleHelp aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent side={side} align={align} sideOffset={sideOffset} className={contentClassName}>
        {children}
        <PopoverArrow />
      </PopoverContent>
    </Popover>
  );
}

export {
  HelpPopover,
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
};
