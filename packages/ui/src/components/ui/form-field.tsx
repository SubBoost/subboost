"use client";

import * as React from "react";
import { Label } from "@subboost/ui/components/ui/label";
import { cn } from "@subboost/ui/lib/utils";

type FormFieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-required"?: React.AriaAttributes["aria-required"];
};

export interface FormFieldProps {
  id?: string;
  label: React.ReactNode;
  labelAction?: React.ReactNode;
  description?: React.ReactNode;
  descriptionPlacement?: "before-control" | "after-control";
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children?: React.ReactElement<FormFieldControlProps>;
}

function mergeIds(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ") || undefined;
}

function FormField({
  id,
  label,
  labelAction,
  description,
  descriptionPlacement = "after-control",
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  const controlChild = React.Children.only(children) as React.ReactElement<FormFieldControlProps>;
  const generatedId = React.useId();
  const controlId = id ?? `form-field-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = mergeIds(
    controlChild.props["aria-describedby"],
    descriptionId,
    errorId
  );

  const control = React.cloneElement(controlChild, {
    id: controlChild.props.id ?? controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : controlChild.props["aria-invalid"],
    "aria-required": required || controlChild.props["aria-required"] || undefined,
  });
  const labelContent = (
    <Label htmlFor={controlChild.props.id ?? controlId}>
      {label}
      {required ? <span aria-hidden="true" className="ml-1 text-red-400">*</span> : null}
    </Label>
  );
  const labelElement = labelAction ? (
    <div className="flex items-center justify-between gap-4">{labelContent}{labelAction}</div>
  ) : labelContent;
  const descriptionElement = description ? (
    <p id={descriptionId} className="text-xs leading-relaxed text-white/45">
      {description}
    </p>
  ) : null;

  return (
    <div className={cn("grid gap-3", className)}>
      {descriptionPlacement === "before-control" && descriptionElement ? (
        <div className="grid gap-1">
          {labelElement}
          {descriptionElement}
        </div>
      ) : (
        labelElement
      )}
      {control}
      {descriptionPlacement === "after-control" ? descriptionElement : null}
      {error ? (
        <p id={errorId} className="text-xs leading-relaxed text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };
