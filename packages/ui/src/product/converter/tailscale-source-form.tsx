"use client";

import * as React from "react";
import {
  hasDuplicateTailscaleStateDir,
  isTailscaleFormDirty,
  serializeTailscaleForm,
  validateTailscaleForm,
  type TailscaleFormErrors,
  type TailscaleFormValues,
  type TailscaleSourceDocument,
  type TailscaleTriState,
} from "@subboost/core/subscription/tailscale-yaml-source";
import { Button } from "@subboost/ui/components/ui/button";
import { ChoiceChip, ChoiceGroup } from "@subboost/ui/components/ui/choice-group";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Input } from "@subboost/ui/components/ui/input";
import { Label } from "@subboost/ui/components/ui/label";
import { PasswordField } from "@subboost/ui/components/ui/password-field";

const TRI_STATE_OPTIONS: Array<{ value: TailscaleTriState; label: string }> = [
  { value: "default", label: "默认" },
  { value: "true", label: "启用" },
  { value: "false", label: "禁用" },
];

type TriStateField = "ephemeral" | "udp" | "acceptRoutes" | "exitNodeAllowLanAccess";

export type TailscaleSourceFormProps = {
  document: TailscaleSourceDocument;
  /** state-dir values of other known Tailscale nodes, for the non-blocking duplicate warning. */
  knownStateDirs: readonly unknown[];
  applyLabel: string;
  onApply: (content: string) => void;
  onCancel: () => void;
  /** Receives applied content, or null when nothing needs to be written before raw editing. */
  onSwitchToRaw?: (appliedContent: string | null) => void;
};

function TriStateField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: TailscaleTriState;
  onChange: (value: TailscaleTriState) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
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
      {description ? <p className="text-xs leading-relaxed text-fg-45">{description}</p> : null}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-ink/10 bg-ink/5 p-3">
      <h3 className="text-xs font-semibold text-fg-80">{title}</h3>
      {children}
    </section>
  );
}

export function TailscaleSourceForm({
  document,
  knownStateDirs,
  applyLabel,
  onApply,
  onCancel,
  onSwitchToRaw,
}: TailscaleSourceFormProps) {
  const [values, setValues] = React.useState<TailscaleFormValues>(document.initial);
  const [errors, setErrors] = React.useState<TailscaleFormErrors>({});
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [confirmingRawSwitch, setConfirmingRawSwitch] = React.useState(false);

  const dirty = isTailscaleFormDirty(document, values);
  const duplicateStateDir = hasDuplicateTailscaleStateDir(values.stateDir, knownStateDirs);

  const update = <K extends keyof TailscaleFormValues>(field: K, value: TailscaleFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setApplyError(null);
  };

  // Validate and serialize once; an invalid draft never reaches the saved source.
  const serialize = (): string | null => {
    const nextErrors = validateTailscaleForm(values);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return null;
    try {
      return serializeTailscaleForm(document, values);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "无法生成 Tailscale YAML");
      return null;
    }
  };

  const handleApply = () => {
    const content = serialize();
    if (content !== null) onApply(content);
  };

  const handleSwitchToRaw = () => {
    if (!onSwitchToRaw) return;
    if (!dirty) {
      onSwitchToRaw(null);
      return;
    }
    setConfirmingRawSwitch(true);
  };

  const applyAndSwitch = () => {
    const content = serialize();
    if (content !== null) onSwitchToRaw?.(content);
  };

  const triState = (field: TriStateField) => ({
    value: values[field],
    onChange: (value: TailscaleTriState) => update(field, value),
  });

  return (
    <div className="space-y-3 text-xs">
      <FormSection title="登录">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="节点名称" required error={errors.name}>
            <Input value={values.name} onChange={(event) => update("name", event.target.value)} className="text-xs" />
          </FormField>
          <PasswordField
            label="auth-key（可选）"
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
        <p className="leading-relaxed text-fg-45">
          未填写 auth-key 且客户端没有可复用的登录状态时，需要在 Mihomo 日志中打开登录链接完成登录。SubBoost
          只校验本地配置格式，不会访问控制服务器或验证密钥，应用成功不代表设备已加入 Tailnet。
        </p>
      </FormSection>

      <FormSection title="路由偏好">
        <FormField
          label="出口节点 exit-node（可选）"
          description="填写出口节点的 IP、受支持的设备名或 auto:any。这是本节点的出站选择，不会把本设备发布为出口节点。"
        >
          <Input
            value={values.exitNode}
            onChange={(event) => update("exitNode", event.target.value)}
            placeholder="例如 100.64.0.1 / auto:any"
            className="text-xs font-mono"
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <TriStateField label="接受子网路由 accept-routes" {...triState("acceptRoutes")} />
          <TriStateField label="出口节点允许访问局域网 exit-node-allow-lan-access" {...triState("exitNodeAllowLanAccess")} />
        </div>
        <ul className="ml-4 list-disc space-y-1 leading-relaxed text-fg-45">
          <li>访问公网目标需要可用的出口节点，或已接受覆盖该目标的路由。</li>
          <li>只能访问 Tailnet 内目标的节点，在公网 URL 测速中可能显示失败。</li>
          <li>“默认”表示不写入该项；从 YAML 中移除偏好或清空出口节点，不一定会重置客户端已保存的运行时偏好。</li>
        </ul>
      </FormSection>

      <FormSection title="高级设置">
        <FormField
          label="状态目录 state-dir"
          description="由客户端 Mihomo 解析的本机目录，相对路径位于 Mihomo 工作目录下。每个设备会使用各自的本地目录。"
        >
          <Input
            value={values.stateDir}
            onChange={(event) => update("stateDir", event.target.value)}
            placeholder="留空使用默认目录 tailscale"
            className="text-xs font-mono"
          />
        </FormField>
        {duplicateStateDir ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 leading-relaxed text-amber-400" role="status">
            另一个已知的 Tailscale 节点看起来使用同一状态目录，它们可能共享登录状态。
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TriStateField label="临时设备 ephemeral" {...triState("ephemeral")} />
          <TriStateField label="UDP" description="默认不写入；Mihomo 默认不为 Tailscale 启用 UDP。" {...triState("udp")} />
        </div>
      </FormSection>

      {applyError ? <p className="text-red-400" role="alert">{applyError}</p> : null}

      {confirmingRawSwitch ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-ink/5 p-3" role="alert">
          <span className="text-fg-70">表单有未应用的修改。</span>
          <Button size="sm" onClick={applyAndSwitch}>应用并切换</Button>
          <Button size="sm" variant="outline" onClick={() => onSwitchToRaw?.(null)}>放弃修改并切换</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingRawSwitch(false)}>继续编辑</Button>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onSwitchToRaw ? (
          <Button variant="ghost" onClick={handleSwitchToRaw} className="mr-auto">切换到 YAML</Button>
        ) : null}
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button onClick={handleApply}>{applyLabel}</Button>
      </div>
    </div>
  );
}
