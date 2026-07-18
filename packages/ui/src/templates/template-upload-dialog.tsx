"use client";

import { Globe, Loader2, Lock, Upload } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { ChoiceChip, ChoiceGroup } from "@subboost/ui/components/ui/choice-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import { cn } from "@subboost/ui/lib/utils";

type UploadMode = "config" | "yaml";

interface TemplateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userIsAdmin: boolean;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  isPublic: boolean;
  onPublicChange: (value: boolean) => void;
  asDefault: boolean;
  onDefaultChange: (value: boolean) => void;
  isUploading: boolean;
  mode: UploadMode;
  onModeChange: (value: UploadMode) => void;
  yamlContent: string;
  onYamlContentChange: (value: string) => void;
  onUpload: () => void;
  showVisibilityControls?: boolean;
}

export function TemplateUploadDialog({
  open,
  onOpenChange,
  userIsAdmin,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  isPublic,
  onPublicChange,
  asDefault,
  onDefaultChange,
  isUploading,
  mode,
  onModeChange,
  yamlContent,
  onYamlContentChange,
  onUpload,
  showVisibilityControls = true,
}: TemplateUploadDialogProps) {
  const visibilityLabel = asDefault ? "默认模板" : isPublic ? "公开模板" : "私有模板";
  const visibilityDescription = asDefault
    ? "将展示在默认模板中"
    : isPublic
      ? "其他用户可以搜索和使用此模板"
      : "仅自己可见和使用";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary-500" />
            上传模板
          </DialogTitle>
          <DialogDescription>
            推荐使用“配置模板”：仅保存生成策略（不包含节点），可被一键应用到配置器。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <FormField label="模板名称" required>
            <Input
              placeholder="例如：流媒体优化配置"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={100}
            />
          </FormField>

          <FormField label="描述（可选）">
            <Textarea
              placeholder="简要描述模板的特点和适用场景..."
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              className="min-h-[80px]"
              maxLength={500}
            />
          </FormField>

          <div className="space-y-2">
            <p className="text-sm font-medium">模板类型</p>
            <ChoiceGroup label="模板类型">
              <ChoiceChip
                selected={mode === "config"}
                label="配置模板"
                onClick={() => onModeChange("config")}
              />
              <ChoiceChip
                selected={mode === "yaml"}
                label="YAML（开发中）"
                onClick={() => onModeChange("yaml")}
                disabled
              />
            </ChoiceGroup>
            {mode === "config" ? (
              <p className="text-xs text-white/50">
                将保存你当前的配置器设置（模板/分组/规则/DNS/自定义分流/中转等），不包含节点，可直接“使用”应用到配置器。
              </p>
            ) : (
              <p className="text-xs text-white/50">YAML 模板上传开发中。</p>
            )}
          </div>

          {userIsAdmin && (
            <SwitchField
              label="作为默认模板"
              description="开启后将发布到“默认模板”（公开）"
              checked={asDefault}
              onCheckedChange={() => {
                  const next = !asDefault;
                  onDefaultChange(next);
                  if (next) {
                    onPublicChange(true);
                    onModeChange("config");
                    onYamlContentChange("");
                  }
                }}
            />
          )}

          {mode === "yaml" && (
            <FormField
              label="配置内容（YAML）"
              description="注意：系统会自动移除实际节点信息，只保留配置结构"
              required
            >
              <Textarea
                placeholder="粘贴您的 YAML 配置内容..."
                value={yamlContent}
                onChange={(event) => onYamlContentChange(event.target.value)}
                className="min-h-[150px] font-mono text-xs"
              />
            </FormField>
          )}

          {showVisibilityControls && (
            <SwitchField
              label={
                <span className="flex items-center gap-2">
                {asDefault || isPublic ? (
                  <Globe className="h-4 w-4 text-green-400" />
                ) : (
                  <Lock className="h-4 w-4 text-white/50" />
                )}
                  {visibilityLabel}
                </span>
              }
              description={visibilityDescription}
              checked={asDefault || isPublic}
              disabled={asDefault}
              onCheckedChange={(checked) => onPublicChange(checked)}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={onUpload}
            disabled={!name.trim() || isUploading || (mode === "yaml" && !yamlContent.trim())}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            上传
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
