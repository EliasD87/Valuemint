import { ZH_SHELL } from "@/lib/zh/shell";
import { ZH_EXPLORE } from "@/lib/zh/explore";
import { ZH_TOKEN } from "@/lib/zh/token";
import { ZH_PORTFOLIO } from "@/lib/zh/portfolio";
import { ZH_STATS } from "@/lib/zh/stats";
import { ZH_COMMUNITY } from "@/lib/zh/community";

/**
 * Simplified Chinese, keyed by the English the code renders (lib/i18n.tsx).
 *
 * One file per area of the site under lib/zh/, merged here. A key is the exact
 * English string passed to `t()`, `{name}` placeholders included; a string with
 * no entry shows in English.
 *
 * ## Rules
 *
 * - Never translated: collection names, token names, trait types and values
 *   (they are the collections' own), SOSO, WSOSO, ValueMint, ValueChain,
 *   SoDEX, Seaport, wallet names, addresses and numbers.
 * - No em dashes (the owner's rule for copy): use "，" or "：" instead.
 * - Terms, matching Cybereator's own Chinese notes (开盒 for opening):
 *     listing 挂单 · listed 已挂单 · not listed 未挂单 · list (verb) 挂单
 *     buy 购买 · buy now 立即购买 · offer 出价 · make an offer 出价
 *     accept 接受 · floor 地板价 · volume 交易量 · owners/holders 持有人
 *     collection 合集 · items/pieces 藏品 · mint 铸造 · minted 已铸造
 *     activity 动态 · sale/sold 成交/已售出 · delisted 已下架
 *     wallet 钱包 · connect wallet 连接钱包 · approve 授权
 *     opened 已开盒 · sealed 未开盒 · reveal 揭示
 *     rarity 稀有度 · Common 普通 · Uncommon 罕见 · Rare 稀有 · Epic 史诗
 *     Legendary 传说 · SuperRare 超稀有 · traits 特征
 *     advanced filters 高级筛选 · portfolio 资产 · expires 到期 · fee 手续费
 */
export const ZH: Record<string, string> = {
  ...ZH_SHELL,
  ...ZH_EXPLORE,
  ...ZH_TOKEN,
  ...ZH_PORTFOLIO,
  ...ZH_STATS,
  ...ZH_COMMUNITY,
};
