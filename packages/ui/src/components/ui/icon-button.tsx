"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@subboost/ui/components/ui/button";

export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "size"> {
  label: string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, title, type = "button", ...props }, ref) => (
    <Button
      ref={ref}
      size="icon"
      type={type}
      aria-label={label}
      title={title ?? label}
      {...props}
    />
  )
);
IconButton.displayName = "IconButton";

export { IconButton };
