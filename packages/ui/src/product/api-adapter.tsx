"use client";

import * as React from "react";
import type { ParseResult, ParsedNode } from "@subboost/core/types/node";
import type { RuleSetInfo } from "@subboost/core/rules/metadata";
import type { TemplateType } from "@subboost/core/types/config";
import { readJsonResponse } from "./client-response";

export type SourceImportRequest = {
  url: string;
  userinfoUrl?: string;
  userinfoUserAgent?: string;
};

export type SourceImportResponse = {
  content: string;
  headers: Record<string, string>;
  parseResult?: ParseResult;
};

export type QuickTemplateSummary = {
  id: string;
  name: string;
  description: string;
};

export type QuickTemplateDetail = {
  name?: string;
  kind?: "config" | "yaml" | "unknown";
  config?: unknown;
};

export type ProductTemplateApi = {
  labels?: {
    catalogName?: string;
    catalogDescription?: string;
    catalogSelectAction?: string;
    engagementAction?: string;
    engagementLoginRequired?: string;
  };
  catalogEnabled?: boolean;
  builtinEngagementEnabled?: boolean;
  loadBuiltinTemplateEngagement?: (
    ids: string[]
  ) => Promise<Record<TemplateType, { id: string; engagementCount: number; isEngaged: boolean }>>;
  toggleTemplateEngagement?: (id: string) => Promise<{ engagementCount: number; isEngaged: boolean }>;
  loadCatalogTemplates?: () => Promise<QuickTemplateSummary[]>;
  loadTemplateDetail?: (id: string) => Promise<QuickTemplateDetail | null>;
};

export type RulesSearchRequest = {
  keyword: string;
  page: number;
  size: number;
  signal?: AbortSignal;
};

export type RulesSearchResponse = {
  items: RuleSetInfo[];
  totalRules: number;
  totalMatched?: number;
  source?: "remote" | "stale" | "unavailable";
};

export type CnCandidateRulesRequest = {
  moduleIds: string[];
  excludedRuleKeys: string[];
  signal?: AbortSignal;
};

export type CnCandidateRule = {
  id: string;
  name: string;
  behavior: "domain";
  path: string;
  parentRuleId?: string;
  parentModuleId?: string;
};

export type ProductRulesApi = {
  detectRuleSet?: (request: { url: string; signal?: AbortSignal }) => Promise<import("@subboost/core/types/config").RuleSetMetadata>;
  getTotalRules?: (signal?: AbortSignal) => Promise<number>;
  searchRules?: (request: RulesSearchRequest) => Promise<RulesSearchResponse>;
  loadCnCandidateRules?: (request: CnCandidateRulesRequest) => Promise<CnCandidateRule[]>;
};

export type ProductApiAdapter = {
  sourceImport?: {
    importSource: (request: SourceImportRequest) => Promise<SourceImportResponse>;
  };
  templates?: ProductTemplateApi;
  rules?: ProductRulesApi;
};

export type RulesProductApiOptions = {
  ruleDetectionEndpoint?: string;
  rulesSearchEndpoint?: string;
  cnCandidatesEndpoint?: string;
  fetchImpl?: typeof fetch;
};

export function createRulesProductApi(options: RulesProductApiOptions = {}): ProductRulesApi {
  const rulesSearchEndpoint = options.rulesSearchEndpoint ?? "/api/rules/search";
  const cnCandidatesEndpoint = options.cnCandidatesEndpoint ?? "/api/rules/cn-candidates";
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));

  return {
    detectRuleSet: async ({ url, signal }) => readJsonResponse(
      await fetchImpl(options.ruleDetectionEndpoint ?? "/api/rules/detect", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal, cache: "no-store",
      }),
    ),
    getTotalRules: async (signal) => {
      const params = new URLSearchParams({ keyword: "", page: "1", size: "1" });
      const data = await readJsonResponse<{ totalRules?: number }>(
        await fetchImpl(`${rulesSearchEndpoint}?${params.toString()}`, { signal, cache: "no-store" })
      );
      return typeof data.totalRules === "number" ? data.totalRules : 0;
    },
    searchRules: async ({ keyword, page, size, signal }) => {
      const params = new URLSearchParams({
        keyword,
        page: String(page),
        size: String(size),
      });
      const data = await readJsonResponse<RulesSearchResponse>(
        await fetchImpl(`${rulesSearchEndpoint}?${params.toString()}`, { signal, cache: "no-store" })
      );
      return {
        items: data.items || [],
        totalRules: typeof data.totalRules === "number" ? data.totalRules : 0,
        totalMatched: data.totalMatched,
        source: data.source,
      };
    },
    loadCnCandidateRules: async ({ moduleIds, excludedRuleKeys, signal }) => {
      const params = new URLSearchParams();
      if (moduleIds.length) params.set("modules", moduleIds.join(","));
      if (excludedRuleKeys.length) params.set("excluded", excludedRuleKeys.join(","));
      const data = await readJsonResponse<{ items?: CnCandidateRule[] }>(
        await fetchImpl(`${cnCandidatesEndpoint}?${params.toString()}`, { signal, cache: "no-store" })
      );
      return data.items || [];
    },
  };
}

const emptyAdapter: ProductApiAdapter = {};
const ProductApiAdapterContext = React.createContext<ProductApiAdapter>(emptyAdapter);

let activeProductApiAdapter: ProductApiAdapter = emptyAdapter;

export function getActiveProductApiAdapter(): ProductApiAdapter {
  return activeProductApiAdapter;
}

export function useProductApiAdapter(): ProductApiAdapter {
  return React.useContext(ProductApiAdapterContext);
}

export function ProductApiAdapterProvider({
  adapter,
  children,
}: {
  adapter?: ProductApiAdapter;
  children: React.ReactNode;
}) {
  const value = adapter ?? emptyAdapter;

  React.useEffect(() => {
    activeProductApiAdapter = value;
    return () => {
      if (activeProductApiAdapter === value) {
        activeProductApiAdapter = emptyAdapter;
      }
    };
  }, [value]);

  return (
    <ProductApiAdapterContext.Provider value={value}>
      {children}
    </ProductApiAdapterContext.Provider>
  );
}
