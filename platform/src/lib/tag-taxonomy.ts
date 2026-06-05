export type AssetTagType = "video" | "image" | "audio" | "avatar";

export type TagCategory = {
  id: string;
  label: string;
  description: string;
  tags: string[];
};

type TagRule = {
  tag: string;
  keywords: string[];
  types?: AssetTagType[];
};

export const tagTaxonomy: TagCategory[] = [
  {
    id: "scene",
    label: "场景",
    description: "门店、现场、办公、仓储等素材发生地点",
    tags: ["门店", "客户现场", "办公室", "工厂", "仓储", "直播间", "展会"],
  },
  {
    id: "person",
    label: "人物",
    description: "顾客、员工、创始人、数字人等画面主体",
    tags: ["顾客", "员工", "老板", "讲师", "数字人", "口播", "绿幕", "人流"],
  },
  {
    id: "product",
    label: "产品",
    description: "产品、服务、包装、方案和案例证据",
    tags: ["产品", "包装", "服务", "方案", "案例", "数据", "客户"],
  },
  {
    id: "emotion",
    label: "情绪",
    description: "痛点、信任、紧迫、活动等叙事语气",
    tags: ["痛点", "信任", "紧迫", "惊喜", "活动", "节日", "转化"],
  },
  {
    id: "shot",
    label: "镜头类型",
    description: "特写、中景、远景、B-roll 和字幕素材",
    tags: ["特写", "中景", "远景", "手持", "延时", "B-roll", "字幕素材"],
  },
  {
    id: "usage",
    label: "用途",
    description: "在分镜中的使用位置和商业用途",
    tags: ["Hook", "证明", "CTA", "招商", "加盟", "BGM", "背景音乐"],
  },
  {
    id: "ip",
    label: "IP",
    description: "行业、品牌和账号方向",
    tags: ["餐饮", "美妆", "增长", "企业服务", "招商", "零售", "教育"],
  },
  {
    id: "platform",
    label: "平台",
    description: "平台和画幅约束",
    tags: ["抖音", "视频号", "小红书", "快手", "9:16", "16:9", "1:1"],
  },
];

const typeBaseTags: Record<AssetTagType, string[]> = {
  video: ["视频", "B-roll"],
  image: ["图片", "视觉素材"],
  audio: ["音频", "BGM", "背景音乐"],
  avatar: ["数字人", "口播"],
};

const tagRules: TagRule[] = [
  { tag: "门店", keywords: ["门店", "店铺", "店面", "store", "shop"] },
  { tag: "客户现场", keywords: ["客户现场", "客户", "client", "case"] },
  { tag: "办公室", keywords: ["办公", "办公室", "office"] },
  { tag: "工厂", keywords: ["工厂", "产线", "factory"] },
  { tag: "仓储", keywords: ["仓库", "仓储", "warehouse"] },
  { tag: "直播间", keywords: ["直播", "直播间", "live"] },
  { tag: "展会", keywords: ["展会", "会展", "expo", "booth"] },
  { tag: "顾客", keywords: ["顾客", "客户", "consumer", "customer"] },
  { tag: "员工", keywords: ["员工", "团队", "staff", "team"] },
  { tag: "老板", keywords: ["老板", "创始人", "founder", "boss"] },
  { tag: "讲师", keywords: ["讲师", "老师", "trainer", "teacher"] },
  { tag: "数字人", keywords: ["数字人", "虚拟人", "avatar", "musetalk", "digital human", "talking"] },
  { tag: "口播", keywords: ["口播", "主持", "讲解", "host", "presenter", "spokesperson", "talking"] },
  { tag: "绿幕", keywords: ["绿幕", "抠绿", "green screen", "greenscreen", "chroma"] },
  { tag: "人流", keywords: ["人流", "客流", "crowd", "traffic"] },
  { tag: "产品", keywords: ["产品", "商品", "product", "sku"] },
  { tag: "包装", keywords: ["包装", "外盒", "package"] },
  { tag: "服务", keywords: ["服务", "service"] },
  { tag: "方案", keywords: ["方案", "流程", "solution", "process"] },
  { tag: "案例", keywords: ["案例", "case", "story"] },
  { tag: "数据", keywords: ["数据", "报表", "增长", "chart", "data"] },
  { tag: "痛点", keywords: ["痛点", "问题", "焦虑", "pain", "problem"] },
  { tag: "信任", keywords: ["信任", "背书", "资质", "trust"] },
  { tag: "紧迫", keywords: ["限时", "倒计时", "紧迫", "urgent"] },
  { tag: "活动", keywords: ["活动", "促销", "sale", "event"] },
  { tag: "节日", keywords: ["节日", "春节", "中秋", "holiday", "festival"] },
  { tag: "转化", keywords: ["转化", "成交", "转介绍", "conversion"] },
  { tag: "特写", keywords: ["特写", "近景", "closeup", "close-up"] },
  { tag: "中景", keywords: ["中景", "medium"] },
  { tag: "远景", keywords: ["远景", "全景", "wide"] },
  { tag: "手持", keywords: ["手持", "handheld"] },
  { tag: "延时", keywords: ["延时", "timelapse", "time-lapse"] },
  { tag: "字幕素材", keywords: ["字幕", "标题", "caption", "subtitle"] },
  { tag: "Hook", keywords: ["开场", "hook", "opening"] },
  { tag: "证明", keywords: ["证明", "证据", "proof"] },
  { tag: "CTA", keywords: ["cta", "结尾", "行动", "咨询"] },
  { tag: "招商", keywords: ["招商", "franchise"] },
  { tag: "加盟", keywords: ["加盟", "join"] },
  { tag: "餐饮", keywords: ["餐饮", "饭店", "茶饮", "restaurant", "food"] },
  { tag: "美妆", keywords: ["美妆", "护肤", "beauty", "skin"] },
  { tag: "增长", keywords: ["增长", "获客", "growth"] },
  { tag: "企业服务", keywords: ["企业服务", "saas", "b2b"] },
  { tag: "零售", keywords: ["零售", "retail"] },
  { tag: "教育", keywords: ["教育", "课程", "education", "course"] },
  { tag: "9:16", keywords: ["9-16", "9_16", "vertical", "竖屏"], types: ["video", "image", "avatar"] },
  { tag: "16:9", keywords: ["16-9", "16_9", "wide", "横屏"], types: ["video", "image", "avatar"] },
  { tag: "1:1", keywords: ["1-1", "1_1", "square", "方形"], types: ["video", "image", "avatar"] },
];

export function getAllTaxonomyTags() {
  return tagTaxonomy.flatMap((category) => category.tags);
}

export function inferAssetTags(fileName: string, mime: string, type: AssetTagType) {
  const text = `${fileName} ${mime}`.toLowerCase();
  const tags = new Set<string>(typeBaseTags[type]);

  for (const rule of tagRules) {
    if (rule.types && !rule.types.includes(type)) continue;
    if (rule.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      tags.add(rule.tag);
    }
  }

  if (type === "video" && tags.size < 4) tags.add("待细分");
  if (type === "image" && tags.size < 4) tags.add("视觉素材");
  if (type === "audio" && tags.size < 4) tags.add("背景音乐");

  return Array.from(tags).slice(0, 10);
}
