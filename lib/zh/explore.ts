/** Simplified Chinese for the explore screens. See lib/i18n.zh.ts for the rules. */
export const ZH_EXPLORE: Record<string, string> = {
  /* ---------------------------------------------------------- rarity words
     Reach `t()` from data (token tiers, the market's chips, the sealed pot). */
  Common: "普通",
  Uncommon: "罕见",
  Rare: "稀有",
  Epic: "史诗",
  Legendary: "传说",
  SuperRare: "超稀有",
  "Super Rare": "超稀有",
  "Common box": "普通盒",
  "Uncommon box": "罕见盒",
  "Rare box": "稀有盒",
  "Super Rare box": "超稀有盒",
  Others: "其他",
  All: "全部",
  Opened: "已开盒",
  Sealed: "未开盒",
  "Opened or sealed": "已开盒或未开盒",

  /* ------------------------------------------------------------- home hero
     config/heroCopy.ts, both versions (creation on and off). */
  "Collect and trade": "收藏与交易",
  "Create, collect and trade": "创建、收藏与交易",
  "everything on ValueChain": "ValueChain 上的一切",
  "Every collection in one place to browse, bid on and trade, with no custodian holding anything. Trades settle in seconds for a fraction of a cent.":
    "所有合集汇聚一处，随时浏览、出价和交易，全程无需托管。每笔交易数秒内完成结算，费用不到一美分。",
  "Deploy your own collection, mint it, and trade it, with no custodian holding anything. You own the contract outright, and every trade settles in seconds for a fraction of a cent.":
    "部署你自己的合集，铸造并交易，全程无需托管。合约完全归你所有，每笔交易数秒内完成结算，费用不到一美分。",
  "~2s blocks": "约 2 秒出块",
  "Explore collections": "浏览合集",
  "Trade NFTs": "交易 NFT",
  "Create a collection": "创建合集",

  /* ------------------------------------------------------- home sections */
  "Top collections": "热门合集",
  "All collections": "全部合集",
  "Minting now": "正在铸造",
  "All mints": "全部铸造",
  "Scroll back": "向前滚动",
  "Scroll on": "向后滚动",
  "Nothing is minting at the moment. Everything already minted is on the {market}.":
    "目前没有正在铸造的合集。已铸造的藏品都在{market}上。",
  market: "市场",
  each: "每个",
  "{minted} of {max} minted": "已铸造 {minted} / {max}",
  "{count} left": "剩余 {count}",
  "Featured pieces": "精选藏品",
  "Browse the market": "浏览市场",
  "Built for trading": "为交易而生",
  "Bulk buy": "批量购买",
  "Pick up to ten pieces on the market and buy them with one signature.":
    "在市场上最多挑选十件藏品，一次签名全部购买。",
  "Offers that wait": "长期有效的出价",
  "Bid on a piece, a trait or a whole collection. Your WSOSO stays in your wallet until someone accepts.":
    "可对单件藏品、某个特征或整个合集出价。在有人接受之前，你的 WSOSO 一直留在你的钱包里。",
  "List a whole level": "按等级整批挂单",
  "Price every Common at once, or pick exactly which pieces go up.":
    "一次为所有普通藏品定价，或精确挑选要挂单的藏品。",
  "Your portfolio": "你的资产",
  "Everything you hold, what it is worth at the floor, and the offers waiting on it.":
    "你持有的全部藏品、按地板价计算的价值，以及等待你处理的出价。",

  /* ------------------------------------------------------ top collections */
  Collection: "合集",
  "Floor · 24h": "地板价 · 24 小时",
  "Nothing has traded yet.": "暂无成交。",
  "{count} listed": "{count} 件已挂单",
  "No floor": "暂无地板价",

  /* ---------------------------------------------------------- collections */
  Collections: "合集",
  "Create yours": "创建你的合集",
  Minting: "铸造中",
  Minted: "已铸造",
  "Mint price": "铸造价格",
  Floor: "地板价",
  Origin: "来源",
  External: "外部",
  "The block explorer’s token list is unavailable right now, so some smaller collections are missing from this page. They are still tradeable (search an address to open one) and reappear here as soon as the explorer answers again.":
    "区块浏览器的代币列表暂时无法访问，因此本页缺少部分较小的合集。它们仍可交易（搜索地址即可打开），浏览器恢复响应后会重新显示在这里。",
  "Show fewer": "收起",
  "See more ({count})": "查看更多（{count}）",

  /* ------------------------------------------------------ collection hero */
  "Loading…": "加载中…",
  "{count} piece": "{count} 件藏品",
  "{count} pieces": "{count} 件藏品",
  "This collection": "此合集",
  "{name} on X (@{handle})": "{name} 的 X 账号（@{handle}）",
  "@{handle} on X": "X 上的 @{handle}",
  "{name} website ({host})": "{name} 官网（{host}）",
  "{name} on Discord": "{name} 的 Discord",
  "Follow on X": "关注 X",
  "Visit {name}": "访问 {name}",
  "Join Discord": "加入 Discord",
  "Verified collection — {reason}": "已认证合集：{reason}",
  "An official SoDEX collection.": "SoDEX 官方合集。",
  "The first NFT collection on ValueChain.": "ValueChain 上的第一个 NFT 合集。",
  "OG — the first ERC-721 collection on ValueChain, deployed 28 Aug 2026":
    "OG：ValueChain 上的第一个 ERC-721 合集，部署于 2026 年 8 月 28 日",

  /* ----------------------------------------------------- collection stats */
  "Collection figures": "合集数据",
  Listed: "已挂单",
  Owners: "持有人",
  "24h volume": "24 小时交易量",
  "Total volume": "总交易量",
  "Trade history couldn’t be read just now, so the volume figures are missing rather than zero.":
    "暂时无法读取交易记录，因此交易量数据缺失，并非为零。",
  "Floor 24h": "24 小时地板价",
  "What this figure means": "这个数字的含义",
  "Today’s floor price compared with the floor {ago}. Positive: the cheapest piece costs more than it did yesterday; negative: less.":
    "今天的地板价与{ago}的地板价相比。正数：最便宜的藏品比昨天贵；负数：比昨天便宜。",
  "24 hours ago": "24 小时前",
  "The floor record could not be read just now.": "暂时无法读取地板价记录。",
  "Nothing is listed right now, so there is no floor today.": "目前没有挂单，因此今天没有地板价。",
  "Nothing was listed 24 hours ago, so there was no floor to compare with.":
    "24 小时前没有挂单，因此没有可比较的地板价。",
  "There is no record of the floor 24 hours ago yet.": "暂无 24 小时前的地板价记录。",
  "Now: {now}. 24 hours ago: {then}.": "当前：{now}。24 小时前：{then}。",

  /* ---------------------------------------------------- collection offers */
  "Collection offers": "合集出价",
  "1 offer": "1 个出价",
  "{count} offers": "{count} 个出价",
  best: "最高",
  "Checking offers…": "正在查询出价…",
  "None yet. Offer on a trait and every holder of it can accept.":
    "暂无出价。对某个特征出价，拥有该特征的所有持有人都可以接受。",
  "None yet. Offer on the collection and any holder can accept.":
    "暂无出价。对合集出价，任何持有人都可以接受。",
  "Make an offer": "出价",
  "Any piece": "任意藏品",
  "Accept": "接受",
  "Accept from your portfolio": "在你的资产中接受",
  "Accept on your #{id}": "用你的 #{id} 接受",
  "Checking your pieces": "正在检查你的藏品",
  "Sell up to {count}": "最多出售 {count} 件",
  "+{count} more": "还有 {count} 个",
  "{head} · {count} wanted": "{head} · 求购 {count} 件",
  "Make a collection offer": "对合集出价",
  "On the collection": "针对整个合集",
  Close: "关闭",
  "Could not read this collection's traits just now. Close this and try again in a moment.":
    "暂时无法读取此合集的特征。请关闭后稍后再试。",
  "Reading this collection's traits…": "正在读取此合集的特征…",
  "By trait.": "按特征。",
  "Only holders of pieces with the trait you pick can accept.": "只有持有带所选特征藏品的人才能接受。",
  "Any piece.": "任意藏品。",
  "Any holder in the collection can accept.": "合集中的任何持有人都可以接受。",
  Trait: "特征",
  Value: "值",
  "{count} minted": "已铸造 {count}",
  "Covers exactly the {count} piece with {trait}. A holder of any other piece cannot sell into it.":
    "仅覆盖带有 {trait} 的 {count} 件藏品。持有其他藏品的人无法向此出价出售。",
  "Covers exactly the {count} pieces with {trait}. A holder of any other piece cannot sell into it.":
    "仅覆盖带有 {trait} 的 {count} 件藏品。持有其他藏品的人无法向此出价出售。",
  "Covers every piece with {trait} minted so far, up to #{bound}. Pieces minted after you place the offer aren’t included, and a holder of any other piece cannot sell into it.":
    "覆盖目前已铸造的所有带有 {trait} 的藏品，直到 #{bound}。你出价之后铸造的藏品不包括在内，持有其他藏品的人也无法向此出价出售。",
  You: "你",

  /* ------------------------------------------------------ collection page */
  "That isn’t a contract address.": "这不是一个合约地址。",
  "A ValueChain address is 0x followed by 40 characters.": "ValueChain 地址以 0x 开头，后跟 40 个字符。",
  "Back to collections": "返回合集",
  "Nothing tradeable at that address.": "该地址没有可交易的内容。",
  "It doesn’t answer as an ERC-721, so this marketplace can’t move its tokens. ERC-1155 collections exist on ValueChain but aren’t supported here yet.":
    "它不是 ERC-721 合约，因此本市场无法转移其代币。ValueChain 上也有 ERC-1155 合集，但这里暂不支持。",
  "Inspect it on the explorer": "在浏览器中查看",
  Items: "藏品",
  Activity: "动态",
  "Top holders": "主要持有人",
  "Collection sections": "合集栏目",
  "Price low": "价格从低到高",
  "Price high": "价格从高到低",
  Newest: "最新",
  Oldest: "最早",
  "Advanced filters": "高级筛选",
  "All rarities": "全部稀有度",
  Any: "任意",
  Clear: "清除",
  "This collection doesn’t publish a token list.": "此合集没有公开代币列表。",
  "It’s a valid ERC-721 and its tokens can still be traded, but it doesn’t implement the optional Enumerable extension, so there’s no way to walk its contents from the chain alone. Open a token directly if you know its id.":
    "这是一个有效的 ERC-721 合约，其代币仍可交易，但它没有实现可选的 Enumerable 扩展，因此无法仅凭链上数据列出其内容。如果你知道代币编号，可以直接打开。",
  "Nothing matches those traits.": "没有符合这些特征的藏品。",
  "Clear a filter to widen the search.": "清除筛选条件以扩大搜索范围。",
  "This collection is empty.": "此合集为空。",
  "Nothing has been minted yet — or everything that was has since been burned.":
    "尚未铸造任何藏品，或已铸造的藏品都已被销毁。",
  "Couldn’t list this collection’s pieces.": "无法列出此合集的藏品。",
  "It reports {count} minted, but the token list could not be read just now. Try again shortly, or open a piece directly if you know its id.":
    "合约显示已铸造 {count} 件，但暂时无法读取代币列表。请稍后再试；如果你知道藏品编号，也可以直接打开。",
  "Searched {searched} of {total} — {matched} match so far":
    "已搜索 {searched} / {total}，目前有 {matched} 件符合",
  Showing: "显示",
  of: "/",
  "Load {count} more": "再加载 {count} 件",

  /* ------------------------------------------------------------ mint panel */
  "Connect wallet to mint": "连接钱包以铸造",
  "Switching…": "切换中…",
  "Switch to ValueChain": "切换到 ValueChain",
  "Sold out": "已售罄",
  "You’ve minted your limit": "你已达到铸造上限",
  "Not enough SOSO": "SOSO 余额不足",
  "Confirm in wallet…": "请在钱包中确认…",
  "Minting…": "铸造中…",
  "Mint for {price} SOSO": "以 {price} SOSO 铸造",
  Available: "可铸造",
  "Per wallet": "每个钱包",
  "No limit": "不限",
  "Minted.": "铸造成功。",
  "View transaction": "查看交易",
  "You cancelled the transaction.": "你取消了交易。",

  /* ------------------------------------------------------- sealed pieces */
  "{count} pieces are sealed, revealed {when}": "{count} 件藏品尚未揭示，将于 {when} 揭示",
  "Mint now to be part of the reveal": "立即铸造，参与这次揭示",
  "Mint before {day} to be part of the reveal": "在 {day} 之前铸造，参与这次揭示",
  "What the sealed pieces hold": "未揭示藏品的构成",
  Mint: "铸造",
  "Not revealed yet": "尚未揭示",
  "One of {count} sealed pieces. Yours is revealed {when}.": "{count} 件未揭示藏品之一。你的藏品将于 {when} 揭示。",
  "Sealed on chain before minting": "铸造前已在链上封存",

  /* ---------------------------------------------------------------- market */
  Done: "完成",
  "Sort listings": "挂单排序",
  Featured: "精选",
  "Price low to high": "价格从低到高",
  "Price high to low": "价格从高到低",
  "from {price} SOSO": "{price} SOSO 起",
  "The node would not serve event logs just now, so listings may be incomplete. Open a collection directly to see what is on offer in it.":
    "节点暂时无法提供事件日志，挂单可能不完整。直接打开某个合集可查看其中的挂单。",
  "Nothing is listed right now.": "目前没有挂单。",
  "Nothing across {n} collection is on offer. Listings are non-custodial, so a piece only appears here once its owner puts it up.":
    "{n} 个合集中目前都没有挂单。挂单无需托管，藏品只有在持有人挂单后才会出现在这里。",
  "Nothing across {n} collections is on offer. Listings are non-custodial, so a piece only appears here once its owner puts it up.":
    "{n} 个合集中目前都没有挂单。挂单无需托管，藏品只有在持有人挂单后才会出现在这里。",
  "List something you own": "挂单你的藏品",
  "Mint something first": "先去铸造",
  "Show {count} more": "再显示 {count} 件",

  /* ------------------------------------------------------------ token card */
  "Reveals {date}": "{date} 揭示",
  "No artwork published": "未发布作品",
  Yours: "你的",
  "Not listed": "未挂单",
  "Not created through ValueMint. Check the contract address before buying — anyone can deploy a collection using someone else's name and artwork.":
    "并非通过 ValueMint 创建。购买前请核对合约地址：任何人都可以用别人的名称和作品部署合集。",
  Unverified: "未认证",
  "Design sealed": "设计已封存",
  "Ed. {edition}": "版本 {edition}",
  "{count} offers · ": "{count} 个出价 · ",
  "No offers": "暂无出价",
  Buy: "购买",
  Offer: "出价",
  /* The Cybereator card (components/CybereatorCard.tsx). */
  "No. {id}": "编号 {id}",
  Opening: "开盒中",
  Token: "代币",
  token: "代币",
  Unnamed: "未命名",
  "Add {name} to the bulk buy": "将 {name} 加入批量购买",
  "Remove {name} from the bulk buy": "将 {name} 从批量购买中移除",
  "One trait per offer: pick any single part instead of a rarity.": "每个出价只对应一个特征：可以改为选择任意一个部件，而不是稀有度。",
  "Covers the {count} opened piece with {trait}. Sealed pieces and pieces opened after you place the offer aren’t included, and a holder of any other piece cannot sell into it.": "覆盖带有 {trait} 的 {count} 件已开盒藏品。未开盒的藏品以及你出价之后才开盒的藏品不包括在内，持有其他藏品的人无法向此出价出售。",
  "Covers the {count} opened pieces with {trait}. Sealed pieces and pieces opened after you place the offer aren’t included, and a holder of any other piece cannot sell into it.": "覆盖带有 {trait} 的 {count} 件已开盒藏品。未开盒的藏品以及你出价之后才开盒的藏品不包括在内，持有其他藏品的人无法向此出价出售。",
  "{count} opened": "{count} 件已开盒",
  "Rarity": "稀有度",
  "Unopened": "未开盒",
  "sealed only": "仅限未开盒",
  "Unopened · ": "未开盒 · ",
  "for an unopened piece · ": "针对未开盒藏品 · ",
  "any Cybereator still sealed when it is sold to you": "成交时仍未开盒的任意 Cybereator",
  "Covers any Cybereator still sealed when it is sold to you. If a piece is opened before the sale, the chain refuses it and your offer stays up.": "覆盖成交时仍未开盒的任意 Cybereator。如果藏品在成交前已开盒，链上会拒绝这笔成交，你的出价继续有效。",
  "{count} pieces are sealed, revealed when the last one is minted": "{count} 件藏品尚未揭示，将在最后一件铸造完成时揭示",
  "One of {count} sealed pieces. Yours is revealed when the last one is minted.": "{count} 件未揭示藏品之一。你的藏品将在最后一件铸造完成时揭示。",
  "Reveals at mint-out": "全部铸造完成时揭示",
};
