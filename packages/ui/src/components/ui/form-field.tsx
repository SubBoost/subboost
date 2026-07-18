"use client";

import * as React from "react";
import { Label } from "@subboost/ui/components/ui/label";
import { cn } from "@subboost/ui/lib/utils";

type FormFieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
};

export interface FormFieldProps {
  id?: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactElement<FormFieldControlProps>;
}

function mergeIds(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ") || undefined;
}

function FormField({
  id,
  label,
  description,
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  const generatedId = React.useId();
  const controlId = id ?? `form-field-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = mergeIds(
    children.props["aria-describedby"],
    descriptionId,
    errorId
  );

  const control = React.cloneElement(children, {
    id: children.props.id ?? controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : children.props["aria-invalid"],
    "aria-required": required || children.props["aria-required"] || undefined,
  });

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={children.props.id ?? controlId}>
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-red-400">*</span> : null}
      </Label>
      {control}
      {description ? (
        <p id={descriptionId} className="text-xs leading-relaxed text-white/45">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs leading-relaxed text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };
