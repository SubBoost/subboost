"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import {
  hasDuplicateTailscaleStateDir,
  isTailscaleFormDirty,
  validateTailscaleForm,
  type TailscaleFormErrors,
  type TailscaleFormValues,
  type TailscaleTriState,
} from "@subboost/core/subscription/tailscale-yaml-source";
import { Button } from "@subboost/ui/components/ui/button";
import { ChoiceChip, ChoiceGroup } from "@subboost/ui/components/ui/choice-group";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Input } from "@subboost/ui/components/ui/input";
import { PasswordField } from "@subboost/ui/components/ui/password-field";
import { HelpPopover } from "@subboost/ui/components/ui/popover";
import { useUnappliedInputGuard } from "@subboost/ui/store/ui-store";

const TRI_STATE_OPTIONS: Array<{ value: TailscaleTriState; label: string }> = [
  { value: "default", label: "默认" },
  { value: "true", label: "启用" },
  { value: "false", label: "禁用" },
];

type TriStateField = "ephemeral" | "udp" | "acceptRoutes" | "exitNodeAllowLanAccess";

/** Where leaving the form goes, once with the applied content and once without it. */
export type TailscaleFormLeave = { apply: (content: string) => void; discard: () => void };

export type TailscaleSourceFormHandle = {
  /** Leaves through `leave`, asking first when edits are unapplied. */
  requestClose: (leave: TailscaleFormLeave) => void;
};

export type TailscaleSourceFormProps = {
  initial: TailscaleFormValues;
  /** state-dir values of other known Tailscale nodes, for the non-blocking duplicate warning. */
  knownStateDirs: readonly unknown[];
  applyLabel: string;
  /** Turns valid values into the source's new YAML; a thrown message is shown in the form. */
  toContent: (values: TailscaleFormValues) => string;
  onApply: (content: string) => void;
  /** Shown before the apply button, e.g. the surrounding dialog's close button. */
  secondaryAction?: React.ReactNode;
  ref?: React.Ref<TailscaleSourceFormHandle>;
};

function TriStateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TailscaleTriState;
  onChange: (value: TailscaleTriState) => void;
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium leading-none text-fg-70">{label}</p>
      <ChoiceGroup label={label} className="gap-1">
        {TRI_STATE_OPTIONS.map((option) => (
          <ChoiceChip
            key={option.value}
            selected={value === option.value}
            onClick={() => onChange(option.value)}
            label={option.label}
            className="min-h-8 px-2.5 py-1 text-xs"
          />
        ))}
      </ChoiceGroup>
    </div>
  );
}

function FormSection({ title, help, children }: { title: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-ink/10 bg-ink/5 p-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-semibold text-fg-80">{title}</h3>
        {help}
      </div>
      {children}
    </section>
  );
}

function RoutingHelp() {
  return (
    <HelpPopover
      label="路由偏好说明"
      side="bottom"
      align="start"
      className="-my-1"
      contentClassName="w-[360px] bg-shade/90 p-3"
    >
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-amber-300" aria-hidden="true" />
          <p className="font-medium text-fg">路由偏好</p>
        </div>
        <ul className="ml-4 list-disc space-y-1 leading-relaxed text-fg-60">
          <li>出口节点只决定本节点的出站，不会把本设备发布为出口节点。</li>
          <li>访问公网目标需要可用的出口节点，或已接受覆盖该目标的路由。</li>
          <li>只能访问 Tailnet 内目标的节点，在公网 URL 测速中可能显示失败。</li>
          <li>“默认”表示不写入该项；从 YAML 中移除偏好或清空出口节点，不一定会重置客户端已保存的运行时偏好。</li>
        </ul>
      </div>
    </HelpPopover>
  );
}

export function TailscaleSourceForm({
  initial,
  knownStateDirs,
  applyLabel,
  toContent,
  onApply,
  secondaryAction,
  ref,
}: TailscaleSourceFormProps) {
  const [values, setValues] = React.useState<TailscaleFormValues>(initial);
  const [errors, setErrors] = React.useState<TailscaleFormErrors>({});
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const leaveRef = React.useRef<TailscaleFormLeave | null>(null);

  const dirty = isTailscaleFormDirty(initial, values);
  useUnappliedInputGuard(dirty);
  const duplicateStateDir = hasDuplicateTailscaleStateDir(values.stateDir, knownStateDirs);

  const update = <K extends keyof TailscaleFormValues>(field: K, value: TailscaleFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setApplyError(null);
  };

  // Validate and write once; an invalid draft never reaches the saved source.
  const serialize = (): string | null => {
    const nextErrors = validateTailscaleForm(values);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return null;
    try {
      return toContent(values);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "无法生成 Tailscale YAML");
      return null;
    }
  };

  const handleApply = () => {
    const content = serialize();
    if (content !== null) onApply(content);
  };

  const requestClose = (leave: TailscaleFormLeave) => {
    if (!dirty) {
      leave.discard();
      return;
    }
    leaveRef.current = leave;
    setConfirming(true);
  };
  React.useImperativeHandle(ref, () => ({ requestClose }));

  const applyPending = () => {
    const content = serialize();
    if (content !== null) leaveRef.current?.apply(content);
  };

  const triState = (field: TriStateField) => ({
    value: values[field],
    onChange: (value: TailscaleTriState) => update(field, value),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 text-xs">
      {/* Fields scroll on short screens; the confirmation and actions below stay in view. */}
      <div className="custom-scrollbar -mr-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
        <FormSection title="登录">
          {/* Top-align cells so a field description never pushes its neighbour's input down. */}
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <FormField label="节点名称" required error={errors.name}>
              <Input value={values.name} onChange={(event) => update("name", event.target.value)} className="text-xs" />
            </FormField>
            <PasswordField
              label="认证密钥 auth-key（可选）"
              description="密钥会写入生成的配置，持有订阅链接或配置文件的人都能读取。"
              value={values.authKey}
              onChange={(event) => update("authKey", event.target.value)}
              placeholder="留空则在 Mihomo 日志中交互登录"
              autoComplete="off"
              className="text-xs font-mono"
            />
            <FormField label="设备名 hostname（可选）">
              <Input
                value={values.hostname}
                onChange={(event) => update("hostname", event.target.value)}
                placeholder="留空由客户端决定"
                className="text-xs"
              />
            </FormField>
            <FormField label="控制服务器 control-url（可选）" error={errors.controlUrl}>
              <Input
                value={values.controlUrl}
                onChange={(event) => update("controlUrl", event.target.value)}
                placeholder="留空使用官方；可填 Headscale 地址"
                className="text-xs font-mono"
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="路由偏好" help={<RoutingHelp />}>
          <FormField label="出口节点 exit-node（可选）" description="填写出口节点的 IP、设备名或 auto:any。">
            <Input
              value={values.exitNode}
              onChange={(event) => update("exitNode", event.target.value)}
              placeholder="例如 100.64.0.1 / auto:any"
              className="text-xs font-mono"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <TriStateField label="接受子网路由 accept-routes" {...triState("acceptRoutes")} />
            <TriStateField label="出口节点可访问局域网 exit-node-allow-lan-access" {...triState("exitNodeAllowLanAccess")} />
          </div>
        </FormSection>

        <FormSection title="高级设置">
          <FormField label="状态目录 state-dir" description="客户端本机目录；相对路径基于 Mihomo 工作目录。">
            <Input
              value={values.stateDir}
              onChange={(event) => update("stateDir", event.target.value)}
              placeholder="留空使用默认目录 tailscale"
              className="text-xs font-mono"
            />
          </FormField>
          {duplicateStateDir ? (
            <p
              className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 leading-relaxed text-amber-100/90"
              role="status"
            >
              另一个已知的 Tailscale 节点看起来使用同一状态目录，它们可能共享登录状态。
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <TriStateField label="临时设备 ephemeral" {...triState("ephemeral")} />
            <TriStateField label="UDP" {...triState("udp")} />
          </div>
        </FormSection>
      </div>

      {applyError ? <p className="shrink-0 text-xs leading-relaxed text-red-400" role="alert">{applyError}</p> : null}

      {confirming ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-ink/5 p-3" role="alert">
          <span className="text-fg-70">表单有未应用的修改。</span>
          <Button size="sm" onClick={applyPending}>应用修改</Button>
          <Button size="sm" variant="outline" onClick={() => leaveRef.current?.discard()}>放弃修改</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>继续编辑</Button>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        {secondaryAction}
        <Button onClick={handleApply}>{applyLabel}</Button>
      </div>
    </div>
  );
}
