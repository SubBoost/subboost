"use client";

import * as React from "react";
import { HelpCircle, Plus } from "lucide-react";
import { DEFAULT_NODE_NAME_TEMPLATE } from "@subboost/core/node-name-template";
import {
  createTailscaleStateDir,
  newTailscaleFormValues,
  readTailscaleFormValues,
  writeTailscaleNode,
  type TailscaleFormValues,
  type TailscaleNodeTarget,
} from "@subboost/core/subscription/tailscale-yaml-source";
import { readYamlSource, type YamlSourceReadResult } from "@subboost/core/subscription/yaml-source-nodes";
import { Button } from "@subboost/ui/components/ui/button";
import { ChoiceChip, ChoiceGroup } from "@subboost/ui/components/ui/choice-group";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { HelpPopover } from "@subboost/ui/components/ui/popover";
import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@subboost/ui/components/ui/tabs";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { cn } from "@subboost/ui/lib/utils";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import { sourceTypeInfo } from "./source-type-info";
import { TailscaleSourceForm, type TailscaleSourceFormHandle } from "./tailscale-source-form";

export type SourceEditorDialogProps = {
  source: SubscriptionSource | null;
  previewName: string;
  onClose: () => void;
  onUpdateContent: (id: string, content: string) => void;
  onUpdateMeta: (id: string, patch: Partial<SubscriptionSource>) => void;
  /** Writes form-applied YAML and closes the editor with a single import. */
  onApplyContent: (content: string) => void;
  /** state-dir values of Tailscale nodes owned by other sources. */
  tailscaleStateDirs?: readonly unknown[];
};

type EditorPage = "yaml" | "tailscale";
/** The Tailscale page edits a new node or an existing one, by its entry index. */
type TailscaleSelection = "new" | number;
type TailscaleView =
  | { kind: "blocked"; reason: string }
  | { kind: "form"; target: TailscaleNodeTarget | null; initial: TailscaleFormValues };

const CHIP_CLASS = "min-h-8 px-2.5 py-1 text-xs";

function newTailscaleDraft(content: string): TailscaleFormValues {
  const read = readYamlSource(content);
  const taken = read.ok ? read.document.entries.map((entry) => entry.name) : [];
  return newTailscaleFormValues(taken, createTailscaleStateDir());
}

function tailscaleView(read: YamlSourceReadResult, selection: TailscaleSelection, draft: TailscaleFormValues): TailscaleView {
  if (!read.ok) return { kind: "blocked", reason: read.reason };
  const { document } = read;
  if (selection === "new") {
    const reason = document.appendBlockedReason;
    return reason ? { kind: "blocked", reason } : { kind: "form", target: null, initial: draft };
  }
  const entry = document.entries.find((item) => item.index === selection);
  if (!entry) return { kind: "blocked", reason: "找不到该节点" };
  const values = readTailscaleFormValues(entry.node);
  if (!values.ok) return { kind: "blocked", reason: values.reason };
  if (document.replaceBlockedReason) return { kind: "blocked", reason: document.replaceBlockedReason };
  return { kind: "form", target: { index: selection, initial: values.values }, initial: values.values };
}

/**
 * The YAML text, and a Tailscale page whose form writes nodes into that same text. Other protocols
 * are still edited as text.
 */
function YamlSourceEditor({
  source,
  meta,
  formRef,
  onUpdateContent,
  onDone,
  tailscaleStateDirs,
}: {
  source: SubscriptionSource;
  meta: React.ReactNode;
  formRef: React.RefObject<TailscaleSourceFormHandle | null>;
  onUpdateContent: (id: string, content: string) => void;
  /** Closes the dialog, asking first when the form has unapplied edits. */
  onDone: () => void;
  tailscaleStateDirs: readonly unknown[];
}) {
  const [page, setPage] = React.useState<EditorPage>("yaml");
  const [selection, setSelection] = React.useState<TailscaleSelection>("new");
  const [draft, setDraft] = React.useState<TailscaleFormValues | null>(null);
  // Parsed only on the Tailscale page, where the text cannot change underneath the form.
  const read = React.useMemo(() => (page === "tailscale" ? readYamlSource(source.content) : null), [page, source.content]);

  const write = (content: string) => {
    if (content !== source.content) onUpdateContent(source.id, content);
  };
  // Leaving the form asks about unapplied edits first; `go` gets the text as it is afterwards.
  const leaveForm = (go: (content: string) => void) => {
    if (!formRef.current) {
      go(source.content);
      return;
    }
    formRef.current.requestClose({
      apply: (content) => {
        write(content);
        go(content);
      },
      discard: () => go(source.content),
    });
  };
  const choose = (next: TailscaleSelection, content: string) => {
    setSelection(next);
    if (next === "new") setDraft(newTailscaleDraft(content));
  };
  const showPage = (next: EditorPage) => {
    if (next === page) return;
    if (next === "yaml") {
      leaveForm(() => setPage("yaml"));
      return;
    }
    choose("new", source.content);
    setPage("tailscale");
  };
  const select = (next: TailscaleSelection) => {
    if (next !== selection) leaveForm((content) => choose(next, content));
  };

  const entries = read?.ok ? read.document.entries : [];
  const nodes = entries.filter((entry) => entry.type === "tailscale");
  const view = read && draft ? tailscaleView(read, selection, draft) : null;
  const ownStateDirs = entries.flatMap((entry) => {
    if (entry.type !== "tailscale" || entry.index === selection) return [];
    const values = readTailscaleFormValues(entry.node);
    return values.ok ? [values.values.stateDir] : [];
  });
  const done = <Button variant="outline" onClick={onDone}>完成</Button>;

  return (
    <Tabs value={page} onValueChange={(value) => showPage(value as EditorPage)} className="flex min-h-0 flex-1 flex-col gap-3">
      <TabsList className="h-8 shrink-0 self-start">
        <TabsTrigger value="yaml" className="h-6 px-3 text-xs">YAML</TabsTrigger>
        <TabsTrigger value="tailscale" className="h-6 px-3 text-xs">Tailscale</TabsTrigger>
      </TabsList>

      <TabsContent value="yaml" className="mt-0 flex min-h-0 flex-1 flex-col gap-3">
        <DialogBody className="flex flex-col gap-3">
          {meta}
          <div className="flex min-h-[9rem] flex-1 flex-col gap-1">
            <p className="text-xs text-fg-60">{sourceTypeInfo[source.type].label}</p>
            <Textarea
              value={source.content}
              onChange={(event) => onUpdateContent(source.id, event.target.value)}
              placeholder={sourceTypeInfo[source.type].placeholder}
              className="min-h-0 flex-1 text-xs font-mono"
            />
          </div>
        </DialogBody>
        <div className="flex shrink-0 justify-end gap-2">{done}</div>
      </TabsContent>

      <TabsContent value="tailscale" className="mt-0 flex min-h-0 flex-1 flex-col gap-3">
        <p className="shrink-0 text-xs leading-relaxed text-fg-60">
          用表单添加或修改 Tailscale / Headscale 出站，应用后写入这份 YAML 的 proxies 列表。
        </p>
        {nodes.length > 0 ? (
          <ChoiceGroup label="选择 Tailscale 节点" className="shrink-0 gap-1">
            <ChoiceChip
              selected={selection === "new"}
              onClick={() => select("new")}
              label={
                <>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  新建节点
                </>
              }
              className={CHIP_CLASS}
            />
            {nodes.map((entry) => (
              <ChoiceChip
                key={entry.index}
                selected={selection === entry.index}
                onClick={() => select(entry.index)}
                label={<span className="max-w-40 truncate">{entry.name || "（未命名）"}</span>}
                title={entry.name}
                className={CHIP_CLASS}
              />
            ))}
          </ChoiceGroup>
        ) : null}
        {view?.kind === "form" ? (
          <TailscaleSourceForm
            key={String(selection)}
            ref={formRef}
            initial={view.initial}
            knownStateDirs={[...tailscaleStateDirs, ...ownStateDirs]}
            applyLabel={view.target ? "应用到 YAML" : "添加到 YAML"}
            toContent={(values) => writeTailscaleNode(source.content, view.target, values)}
            onApply={(content) => {
              write(content);
              setPage("yaml");
            }}
            secondaryAction={done}
          />
        ) : (
          <>
            <div className="shrink-0 space-y-1 rounded-xl border border-ink/10 bg-ink/5 px-3 py-2 text-xs leading-relaxed" role="status">
              <p className="font-medium text-fg-80">无法用表单写入这份 YAML</p>
              <p className="text-fg-60">{view?.reason}</p>
            </div>
            <div className="mt-auto flex shrink-0 justify-end gap-2">{done}</div>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

export function SourceEditorDialog({
  source,
  previewName,
  onClose,
  onUpdateContent,
  onUpdateMeta,
  onApplyContent,
  tailscaleStateDirs = [],
}: SourceEditorDialogProps) {
  // Set only while the Tailscale form is shown; the form decides whether closing needs confirmation.
  const formRef = React.useRef<TailscaleSourceFormHandle | null>(null);
  const requestClose = () => {
    if (formRef.current) formRef.current.requestClose({ apply: onApplyContent, discard: onClose });
    else onClose();
  };

  const meta = source ? (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="标签（tag）">
          <Input
            value={source.tag ?? ""}
            onChange={(event) => onUpdateMeta(source.id, { tag: event.target.value })}
            placeholder="例如：A / 订阅1 / 自建1"
            className="text-xs"
          />
        </FormField>
        <FormField label="节点命名模板">
          <Input
            value={source.nameTemplate ?? DEFAULT_NODE_NAME_TEMPLATE}
            onChange={(event) => onUpdateMeta(source.id, { nameTemplate: event.target.value })}
            className="text-xs font-mono"
          />
        </FormField>
        <FormField label="预览">
          <Input value={previewName} readOnly className="text-xs font-mono" />
        </FormField>
      </div>

      <p className="text-[11px] text-fg-40">
        可用占位符：{"{tag}"}、{"{name}"}；留空则默认：{DEFAULT_NODE_NAME_TEMPLATE}
      </p>
    </>
  ) : null;

  const footer = (
    <div className="flex shrink-0 justify-end gap-2">
      <Button variant="outline" onClick={onClose}>完成</Button>
    </div>
  );

  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => !open && requestClose()}>
      {/* Text editors take a fixed share of the screen so the text area, not the dialog, absorbs height. */}
      <DialogContent
        className={cn(
          "flex w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-4xl",
          source && source.type !== "url" && "h-[85dvh]"
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{source ? `高级编辑：${sourceTypeInfo[source.type].label}` : "高级编辑"}</DialogTitle>
        </DialogHeader>

        {source && source.type !== "yaml" ? (
          <DialogBody className="flex flex-col gap-3">
            {meta}

            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <p className="text-xs text-fg-60">{sourceTypeInfo[source.type].label}</p>
              {source.type === "url" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Input
                      value={source.content}
                      onChange={(event) => onUpdateContent(source.id, event.target.value)}
                      placeholder={sourceTypeInfo[source.type].placeholder}
                      className="min-w-0 flex-1 text-xs"
                    />
                    <div className="flex h-10 flex-none items-center gap-2 rounded-xl border border-ink/10 bg-ink/5 px-3">
                      <span className="whitespace-nowrap text-xs text-fg-70">proxy-providers模式</span>
                      <HelpPopover
                        label="proxy-providers 模式说明"
                        side="bottom"
                        align="end"
                        contentClassName="w-[360px] bg-shade/90 p-3"
                      >
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-2">
                            <HelpCircle className="h-4 w-4 text-amber-300" aria-hidden="true" />
                            <p className="font-medium text-fg">proxy-providers 模式</p>
                          </div>
                          <p className="leading-relaxed text-fg-60">
                            部分订阅限制 CN IP 导入，url 无法在 SubBoost 内拉取解析。开启后 SubBoost
                            不再拉取/解析该 url，而是在最终配置中写入{" "}
                            <span className="font-mono">proxy-providers</span>，交由客户端自行拉取节点。
                          </p>
                          <div className="space-y-1 border-t border-ink/10 pt-2 text-fg-60">
                            <p className="font-medium text-fg-80">注意开启后：</p>
                            <ul className="ml-4 list-disc space-y-1">
                              <li>无法在预览中查看/管理该 url 的节点</li>
                              <li>无法将这些节点用于中转代理组、分流组高级模式等高级功能</li>
                              <li>节点命名模板与 tag 在该模式下不生效</li>
                            </ul>
                          </div>
                          <p className="border-t border-ink/10 pt-2 text-[10px] text-fg-40">
                            若导入 url 报“未解析到有效节点/获取失败”等，可尝试开启此模式。
                          </p>
                        </div>
                      </HelpPopover>
                      <Switch
                        checked={Boolean(source.useProxyProviders)}
                        onCheckedChange={(checked) => onUpdateMeta(source.id, { useProxyProviders: checked })}
                        aria-label="使用 proxy-providers 模式"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="流量/到期信息 URL（可选）">
                      <Input
                        value={source.userinfoUrl ?? ""}
                        onChange={(event) => onUpdateMeta(source.id, { userinfoUrl: event.target.value })}
                        placeholder="留空则默认使用当前订阅源 URL"
                        className="text-xs"
                      />
                    </FormField>
                    <FormField label="流量信息 User-Agent（可选）">
                      <Input
                        value={source.userinfoUserAgent ?? ""}
                        onChange={(event) => onUpdateMeta(source.id, { userinfoUserAgent: event.target.value })}
                        placeholder="例如 clash.meta/v1.19.16"
                        className="text-xs"
                      />
                    </FormField>
                  </div>
                  <p className="text-[11px] text-fg-40">
                    有些订阅源不会直接返回 <span className="font-mono">subscription-userinfo</span>，但会提供独立的流量接口。
                    设置后，SubBoost 会在导入/刷新时额外抓取该接口，用来更新这个源自己的流量与到期快照。
                  </p>
                </div>
              ) : (
                <Textarea
                  value={source.content}
                  onChange={(event) => onUpdateContent(source.id, event.target.value)}
                  placeholder={sourceTypeInfo[source.type].placeholder}
                  className="min-h-[9rem] flex-1 text-xs font-mono"
                />
              )}
            </div>
          </DialogBody>
        ) : null}

        {source?.type === "yaml" ? (
          <YamlSourceEditor
            key={source.id}
            source={source}
            meta={meta}
            formRef={formRef}
            onUpdateContent={onUpdateContent}
            onDone={requestClose}
            tailscaleStateDirs={tailscaleStateDirs}
          />
        ) : (
          footer
        )}
      </DialogContent>
    </Dialog>
  );
}
