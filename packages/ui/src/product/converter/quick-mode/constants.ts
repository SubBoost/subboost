import type { TemplateType } from "@subboost/core/types/config";
import { getTemplateList } from "@subboost/core/templates";
export { sourceTypeInfo } from "@subboost/ui/product/converter/source-type-info";

const templateCounts = new Map(
  getTemplateList().map((template) => [template.id, { groups: template.groupCount, rules: template.ruleCount }])
);

function countsFor(id: TemplateType) {
  return templateCounts.get(id) ?? { groups: 0, rules: 0 };
}

export const templates = [
  {
    id: "minimal" as TemplateType,
    name: "精简版",
    description: "基础代理组 + 国内外分流",
    ...countsFor("minimal"),
  },
  {
    id: "standard" as TemplateType,
    name: "标准版",
    description: "完整代理组 + 常用规则",
    ...countsFor("standard"),
  },
  {
    id: "full" as TemplateType,
    name: "完整版",
    description: "全部功能 + 扩展规则集",
    ...countsFor("full"),
  },
];
