export type BrandConfig = {
  id: string;
  name: string;
  industry: string;
  color: string;
  tone: string;
  promise: string;
  defaultBgm: string;
};

export type TemplateConfig = {
  id: string;
  name: string;
  category: string;
  duration: string;
  layout: string;
  bestFor: string;
  accent: string;
};

export type CutixConfig = {
  brands: BrandConfig[];
  templates: TemplateConfig[];
};

export const defaultBrands: BrandConfig[] = [
  {
    id: "wang",
    name: "老王餐饮",
    industry: "餐饮招商加盟",
    color: "#FF3B5C",
    tone: "专业、直接、有紧迫感",
    promise: "突出回本模型、门店复制和招商转化",
    defaultBgm: "商务节奏 BGM",
  },
  {
    id: "li",
    name: "李总商业",
    industry: "企业增长服务",
    color: "#38BDF8",
    tone: "理性、可信、数据化",
    promise: "强调方法论、案例证据和增长结果",
    defaultBgm: "稳健科技 BGM",
  },
  {
    id: "zhang",
    name: "张姐美妆",
    industry: "美妆护肤品牌",
    color: "#F472B6",
    tone: "亲近、审美强、重体验",
    promise: "突出前后对比、真实体验和社交种草",
    defaultBgm: "轻快生活 BGM",
  },
];

export const defaultTemplates: TemplateConfig[] = [
  {
    id: "split",
    name: "数字人 + 素材分屏",
    category: "口播混剪",
    duration: "30s",
    layout: "数字人在上，素材在下",
    bestFor: "招商、口播、IP 短视频",
    accent: "#FF3B5C",
  },
  {
    id: "product",
    name: "产品卖点介绍",
    category: "产品",
    duration: "35s",
    layout: "素材主画面，数字人角标",
    bestFor: "产品讲解、服务说明",
    accent: "#14B8A6",
  },
  {
    id: "case",
    name: "案例证明短片",
    category: "案例",
    duration: "40s",
    layout: "数据卡 + B-roll + 字幕",
    bestFor: "案例、背书、成交证明",
    accent: "#A855F7",
  },
];

export const defaultConfig: CutixConfig = {
  brands: defaultBrands,
  templates: defaultTemplates,
};
