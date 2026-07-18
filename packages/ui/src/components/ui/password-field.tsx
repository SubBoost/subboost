"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { Input, type InputProps } from "@subboost/ui/components/ui/input";
import { cn } from "@subboost/ui/lib/utils";

interface PasswordControlProps extends Omit<InputProps, "type"> {
  visible: boolean;
  onVisibleChange: () => void;
}

const PasswordControl = React.forwardRef<HTMLInputElement, PasswordControlProps>(
  ({ visible, onVisibleChange, className, disabled, ...props }, ref) => (
    <span className="relative block">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pr-12", className)}
        disabled={disabled}
        {...props}
      />
      <IconButton
        label={visible ? "隐藏密码" : "显示密码"}
        variant="ghost"
        disabled={disabled}
        onClick={onVisibleChange}
        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-white/50 hover:text-white"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </IconButton>
    </span>
  )
);
PasswordControl.displayName = "PasswordControl";

export interface PasswordFieldProps extends Omit<InputProps, "type"> {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  fieldClassName?: string;
}

const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ label, description, error, required, fieldClassName, id, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <FormField
        id={id}
        label={label}
        description={description}
        error={error}
        required={required}
        className={fieldClassName}
      >
        <PasswordControl
          ref={ref}
          visible={visible}
          onVisibleChange={() => setVisible((current) => !current)}
          {...props}
        />
      </FormField>
    );
  }
);
PasswordField.displayName = "PasswordField";

export { PasswordField };
