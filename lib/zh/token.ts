/** Simplified Chinese for the token screens. See lib/i18n.zh.ts for the rules. */
export const ZH_TOKEN: Record<string, string> = {
  /* ---------------------------------------------------------- rarity words
     The same values as lib/zh/explore.ts, repeated so the token screens never
     depend on another area's file. Reached from data: tiers, level chips. */
  Common: "普通",
  Uncommon: "罕见",
  Rare: "稀有",
  Epic: "史诗",
  Legendary: "传说",
  SuperRare: "超稀有",
  "Super Rare": "超稀有",
  All: "全部",
  Unsorted: "未分级",

  /* ------------------------------------------------------------ token page */
  "That isn’t a valid token.": "这不是一个有效的代币。",
  "Back to the marketplace": "返回市场",
  "Checking…": "检查中…",
  Burned: "已销毁",
  "Listing…": "挂单中…",
  "Settling…": "结算中…",
  "Cancelling…": "取消中…",
  "For sale": "出售中",
  "Listing stale": "挂单已失效",
  "Listing unknown": "挂单状态未知",
  "Not for sale": "未出售",
  "Token {id}": "代币 {id}",
  "No artwork published": "未发布作品图",
  "{collection} does not publish per-token metadata, so there is no picture or traits to show — only its creator can add them. The piece itself is real and trades normally.":
    "{collection} 未发布单个代币的元数据，因此没有图片或特征可显示，只有其创建者可以添加。藏品本身真实存在，可正常交易。",
  "This collection does not publish per-token metadata, so there is no picture or traits to show — only its creator can add them. The piece itself is real and trades normally.":
    "该合集未发布单个代币的元数据，因此没有图片或特征可显示，只有其创建者可以添加。藏品本身真实存在，可正常交易。",
  Details: "详情",
  Contract: "合约",
  "Token ID": "代币 ID",
  Standard: "标准",
  Chain: "链",
  "View on the block explorer →": "在区块浏览器中查看 →",
  Collection: "合集",
  "Loading…": "加载中…",
  "No owner": "无持有人",
  "Owned by": "持有人",
  you: "你",
  "You own this": "你持有此藏品",
  Price: "价格",
  "It is listed again at {price} — less than the price you clicked. Check it before buying.":
    "它已重新挂单，价格为 {price}，低于你点击时的价格。购买前请先确认。",
  "It is listed again at {price} — more than the price you clicked. Check it before buying.":
    "它已重新挂单，价格为 {price}，高于你点击时的价格。购买前请先确认。",
  "Nothing is listed for this piece at the moment.": "这件藏品目前没有挂单。",
  "This piece was burned, so it no longer exists. It can’t be bought, sold or offered on. Its history is below.":
    "这件藏品已被销毁，不再存在。它无法被购买、出售或出价。其历史记录见下方。",
  "This piece is yours. The listing above is the one you just bought and disappears within a minute, once the order book has read the block it settled in.":
    "这件藏品已归你所有。上方的挂单就是你刚刚购买的那一笔，订单簿读取到其结算所在的区块后，它会在一分钟内消失。",
  "You hold this piece, and the listing showing here was made by whoever held it before you. It can no longer be filled, and it stops showing once it expires or its maker cancels it.":
    "你持有这件藏品，此处显示的挂单是由之前的持有人创建的。它已无法成交，到期或被其创建者取消后将不再显示。",
  "This listing is stale — the owner moved the token or withdrew the marketplace’s approval. Buying it would fail, so the button is disabled.":
    "该挂单已失效：持有人已转走该代币，或撤销了对市场的授权。购买将会失败，因此按钮已停用。",
  "Cancel listing": "取消挂单",
  "Connect wallet to buy": "连接钱包以购买",
  "No longer available": "已不可购买",
  "Checking it is still for sale…": "正在确认是否仍在出售…",
  "Confirm in wallet…": "请在钱包中确认…",
  "Buying…": "购买中…",
  "Buy now": "立即购买",
  "Make offer": "出价",
  "Checking whether this is for sale": "正在检查是否出售",
  "Your listing is on chain. It takes up to a minute to appear in the market, because the book is rebuilt from confirmed blocks. Do not list it again — you would end up with two live listings at different prices.":
    "你的挂单已上链。由于订单簿是根据已确认的区块重建的，最多需要一分钟才会出现在市场中。请勿再次挂单，否则你将同时拥有两个不同价格的有效挂单。",
  "Your cancellation is on chain and the listing will stop showing shortly.": "你的取消操作已上链，该挂单很快将不再显示。",
  "Sell this piece": "出售这件藏品",
  "Price in SOSO": "价格（SOSO）",
  "You receive": "你将收到",
  Marketplace: "市场",
  "Listing: step {step} of 2": "挂单：第 {step} 步，共 2 步",
  "Approve once": "授权一次",
  "List it": "挂单",
  "The marketplace needs permission to move this token when it sells. Your token stays in your wallet either way — this is one transaction, once per collection.":
    "市场需要获得授权，才能在售出时转移该代币。无论如何，你的代币都会留在你的钱包中。这是一笔交易，每个合集只需一次。",
  "Approving…": "授权中…",
  "Approve marketplace": "授权市场",
  "List for sale": "挂单出售",
  "Whether this is listed could not be read — the node would not serve event logs. Do not list it again until this loads; you could end up with two live listings at different prices.":
    "无法读取它是否已挂单：节点未提供事件日志。在加载完成之前请勿再次挂单，否则你可能会同时拥有两个不同价格的有效挂单。",
  "The owner hasn’t set a price. Make an offer and they can accept it.": "持有人尚未定价。你可以出价，持有人可以接受。",
  "The owner hasn’t set a price.": "持有人尚未定价。",
  "Connect wallet to offer": "连接钱包以出价",
  "Offers and activity": "出价与动态",
  Offers: "出价",
  Activity: "动态",

  /* ------------------------------------------------- results (TxResult) */
  "Waiting for the chain to confirm…": "等待链上确认…",
  "Track it": "跟踪",
  "{label}.": "{label}。",
  "View transaction": "查看交易",
  "Approved — now set a price and list it": "已授权，现在设置价格并挂单",
  Listed: "已挂单",
  "Listing cancelled": "挂单已取消",
  Bought: "已购买",
  Done: "已完成",
  Approved: "已授权",
  Sold: "已售出",
  "Approved. Now accept the offer.": "已授权。现在接受出价",
  "Wrapped — now allow it to be spent": "已包装，现在授权其可被使用",
  "Allowed — now place your offer": "已授权，现在提交你的出价",
  "Offer placed": "出价已提交",
  Unwrapped: "已解包",
  "Bought {count}": "已购买 {count} 件",
  "Sold {count}": "已售出 {count} 件",

  /* ------------------------------------------- wallet and chain failures
     lib/txError.ts, word for word, CHAIN_NAME and STEADY_RPC expanded. */
  "You cancelled that in your wallet.": "你已在钱包中取消了该操作。",
  "That transaction failed.": "该交易失败。",
  "Your wallet is on a different network. Switch it to ValueChain and try again.":
    "你的钱包连接的是其他网络。请切换到 ValueChain 后重试。",
  "Your wallet could not reach that contract. Check it is on ValueChain, and that no other wallet request is still waiting.":
    "你的钱包无法访问该合约。请确认钱包连接的是 ValueChain，并且没有其他钱包请求仍在等待中。",
  "Your wallet reused the number of your last transaction because its network had not caught up yet. Nothing was sent and nothing was charged. Wait a few seconds and try again.":
    "由于钱包的网络尚未同步，它重复使用了你上一笔交易的编号。没有发送任何交易，也没有收取任何费用。请等待几秒后重试。",
  "ValueChain's network server was too busy and turned the request away. Nothing was sent and nothing was charged. Wait a moment and try again. If it keeps happening, set your wallet's ValueChain RPC to https://mainnet.valuechain.xyz.":
    "ValueChain 的网络服务器过于繁忙，拒绝了该请求。没有发送任何交易，也没有收取任何费用。请稍候再试。如果问题持续出现，请将钱包的 ValueChain RPC 设置为 https://mainnet.valuechain.xyz。",
  "Not enough SOSO in this wallet to cover the amount and the gas.": "该钱包中的 SOSO 不足以支付金额和 Gas 费。",
  "There is nothing to withdraw — the balance is already zero.": "没有可提取的金额：余额已经为零。",
  "The marketplace needs permission to move this piece first. Approve it, then try again.":
    "市场需要先获得转移这件藏品的授权。请先授权，然后重试。",
  "This wallet does not hold that piece any more.": "该钱包已不再持有那件藏品。",
  "That offer is no longer standing — it was withdrawn, accepted or replaced.": "该出价已不再有效：它已被撤回、接受或替换。",
  "That offer has expired.": "该出价已过期。",
  "The bidder lowered their offer while you were looking at it, so nothing was sold.":
    "在你查看时，出价人降低了出价，因此没有售出任何藏品。",
  "That listing has expired. The seller needs to list it again.": "该挂单已过期。卖家需要重新挂单。",
  "That piece is not listed for sale any more.": "那件藏品已不再挂单出售。",
  "You cannot trade with yourself.": "你不能与自己交易。",
  "This collection's artwork is frozen and cannot be changed.": "该合集的作品已冻结，无法更改。",
  "This wallet has already minted as many as the collection allows.": "该钱包已达到该合集允许的铸造上限。",
  "Public minting is closed for this collection.": "该合集的公开铸造已关闭。",
  "This collection is sold out.": "该合集已售罄。",
  "This portrait has already been claimed. It went to the wallet on the list, so check that wallet.":
    "该肖像已被领取。它已发送到名单上的钱包，请检查该钱包。",
  "Claiming has closed. Reach out to us and we will sort it out.": "领取已结束。请联系我们，我们会帮你处理。",
  "Claiming has not opened yet. Check back soon.": "领取尚未开放。请稍后再来查看。",
  "No wallet is on the list for this portrait yet.": "该肖像的名单上还没有钱包。",
  "Somebody else bought this first. Your transaction reverted, so nothing was charged beyond gas, and you still hold what you held.":
    "已有其他人先买下了它。你的交易已回滚，因此除 Gas 费外没有收取任何费用，你原有的资产不变。",
  "The person who made this order cancelled it before your transaction landed. Nothing was exchanged.":
    "在你的交易上链之前，该订单的创建者已将其取消。没有发生任何交换。",
  "Someone took part of this lot while you were confirming, so the amount you asked for is no longer available. Try again for what is left.":
    "在你确认期间，有人买走了这批中的一部分，因此你要求的数量已不再可用。请针对剩余数量重试。",
  "This order expired before your transaction landed.": "在你的交易上链之前，该订单已过期。",
  "That order is no longer available to fill.": "该订单已无法成交。",
  "The amount sent did not match the order's price. The price may have changed since this page loaded — reload and try again.":
    "发送的金额与订单价格不符。自页面加载以来价格可能已变动，请刷新后重试。",
  "This order asks for something the transaction did not provide. Reload the page so you are looking at its current terms.":
    "该订单要求的内容交易中并未提供。请刷新页面以查看其当前条款。",
  "This listing cannot be split into the quantity you asked for.": "该挂单无法按你要求的数量拆分。",
  "Only the account that made an order can cancel it.": "只有创建订单的账户才能取消它。",
  "This order could not be authorised. It may have been replaced or withdrawn.": "该订单无法通过授权验证。它可能已被替换或撤回。",
  "The seller no longer holds this piece, or has withdrawn the marketplace's permission to move it. The listing is stale.":
    "卖家已不再持有这件藏品，或已撤销市场转移它的授权。该挂单已失效。",

  /* ----------------------------------------------- refused before signing
     lib/fillCheck.ts, lib/bulkBuy.ts and FILL_REVERTED in useSeaportTrade. */
  "Somebody bought this while you were looking. Nothing was sent, and you have not paid any gas.":
    "在你查看时，已有人买下了它。没有发送任何交易，你也没有支付任何 Gas 费。",
  "The seller withdrew this listing. Nothing was sent, and you have not paid any gas.":
    "卖家已撤回该挂单。没有发送任何交易，你也没有支付任何 Gas 费。",
  "Someone took part of this lot while you were looking, so the amount you asked for is no longer there. Try again for what is left.":
    "在你查看时，有人买走了这批中的一部分，因此你要求的数量已不复存在。请针对剩余数量重试。",
  "This listing expired before you got to it. The seller would need to list it again.":
    "在你操作之前，该挂单已过期。卖家需要重新挂单。",
  "This listing is no longer live — the seller withdrew it, or cancelled everything they had for sale. Nothing was sent.":
    "该挂单已失效：卖家已撤回它，或取消了其所有在售挂单。没有发送任何交易。",
  "The seller no longer holds this piece, or has withdrawn the marketplace's permission to move it. Nothing was sent.":
    "卖家已不再持有这件藏品，或已撤销市场转移它的授权。没有发送任何交易。",
  "Someone else already sold into this offer. Nothing was sent, and you have not paid any gas.":
    "已有其他人向该出价出售了藏品。没有发送任何交易，你也没有支付任何 Gas 费。",
  "The bidder withdrew this offer. Nothing was sent, and you have not paid any gas.":
    "出价人已撤回该出价。没有发送任何交易，你也没有支付任何 Gas 费。",
  "This offer expired before you got to it. Nothing was sent.": "在你操作之前，该出价已过期。没有发送任何交易。",
  "This offer is no longer live — the bidder withdrew it, or cancelled everything they had standing. Nothing was sent.":
    "该出价已失效：出价人已撤回它，或取消了其所有有效出价。没有发送任何交易。",
  "Everything you picked has already gone to someone else. Nothing was sent, and you have not paid any gas.":
    "你选中的所有藏品都已被他人买走。没有发送任何交易，你也没有支付任何 Gas 费。",
  "None of these went through: someone else got them first. Nothing was bought; you paid only a little gas.":
    "这些都没有成交：已被他人抢先买走。没有购买任何藏品，你只支付了少量 Gas 费。",
  "The sale did not go through: someone else most likely sold into this offer, or the bidder withdrew it, a moment before yours landed. Nothing was sold; you paid only a little gas.":
    "出售未成功：很可能在你的交易上链前片刻，已有他人向该出价出售，或出价人撤回了出价。没有售出任何藏品，你只支付了少量 Gas 费。",
  "The purchase did not go through: someone else most likely bought this, or the seller withdrew it, a moment before yours landed. Nothing was bought; you paid only a little gas.":
    "购买未成功：很可能在你的交易上链前片刻，已有他人买下，或卖家撤回了挂单。没有购买任何藏品，你只支付了少量 Gas 费。",

  /* ---------------------------------------------------------------- traits */
  Traits: "特征",

  /* ------------------------------------------------------------ token stats */
  "Token figures": "代币数据",
  "Best offer": "最高出价",
  "Last sale": "最近成交",
  Floor: "地板价",
  "Collection floor": "合集地板价",
  "{tier} floor": "{tier}地板价",
  "none listed": "无挂单",
  Rarity: "稀有度",
  "{share}% of the collection": "占合集的 {share}%",
  "{count} share it": "{count} 件相同",

  /* ---------------------------------------------------------------- offers */
  "no expiry": "永不过期",
  expired: "已过期",
  "{days}d left": "剩余 {days} 天",
  "{hours}h left": "剩余 {hours} 小时",
  "under an hour": "不到 1 小时",
  "{count} live · best {price}": "{count} 个有效 · 最高 {price}",
  "Before you can accept, the marketplace needs permission to move this piece when it sells. One transaction, once per collection — the piece stays in your wallet until somebody buys it.":
    "在你接受出价之前，市场需要获得授权，才能在售出时转移这件藏品。这是一笔交易，每个合集只需一次，藏品在被买走之前会一直留在你的钱包中。",
  "Last step before you can accept. The marketplace fee comes out of what the buyer pays you, in WSOSO, so it needs permission to take that much — nothing leaves your wallet now, and you never have to hold WSOSO yourself.":
    "接受出价前的最后一步。市场手续费以 WSOSO 从买家支付给你的款项中扣除，因此需要获得扣取该金额的授权。现在不会有任何资产离开你的钱包，你也无需自己持有 WSOSO。",
  "Offers could not be loaded just now — the node would not serve event logs. This does not mean there are none.":
    "暂时无法加载出价：节点未提供事件日志。这并不代表没有出价。",
  "Checking offers…": "正在检查出价…",
  "No offers yet.": "暂无出价。",
  You: "你",
  "any piece · ": "任意藏品 · ",
  "{left} of {total} wanted · ": "求购 {total} 件，剩余 {left} 件 · ",
  Withdraw: "撤回",
  "Approve, then accept": "授权，然后接受",
  "Allow fee, then accept": "授权手续费，然后接受",
  "Accept offer": "接受出价",
  "Make an offer": "出价",
  "Make another offer": "再出一个价",

  /* ------------------------------------------------------------ offer form */
  "1 day": "1 天",
  "1 week": "1 周",
  "1 month": "1 个月",
  "3 months": "3 个月",
  "How many": "数量",
  "Price each": "单价",
  Amount: "金额",
  Expires: "到期",
  "{quantity} pieces at {each} each = {total} WSOSO in total. Holders sell to you one or more at a time, each at that price, until you have {quantity}.":
    "{quantity} 件，每件 {each}，共计 {total} WSOSO。持有人可以每次向你出售一件或多件，均按此价格，直到你凑齐 {quantity} 件。",
  "You hold {balance} WSOSO": "你持有 {balance} WSOSO",
  "You hold {balance} WSOSO — {standing} of it is committed to offers you already have standing":
    "你持有 {balance} WSOSO，其中 {standing} 已用于你现有的有效出价",
  "Steps to place this offer": "提交此出价的步骤",
  Wrap: "包装",
  Allow: "授权",
  Offer: "出价",
  "Wrapping…": "包装中…",
  "Wrap {amount} SOSO first": "先包装 {amount} SOSO",
  "Allow {amount} WSOSO": "授权 {amount} WSOSO",
  "That total is this {wanted} WSOSO offer plus the {standing} already committed to your standing offers — not the size of this one. Approving less would leave those uncovered.":
    "该总额是本次 {wanted} WSOSO 的出价，加上已用于你现有出价的 {standing}，并非本次出价的金额。授权更少会使那些出价失去资金保障。",
  "Placing…": "提交中…",
  "Replace offer": "替换出价",
  "Place offer for {count}": "为 {count} 件出价",
  "Place offer": "提交出价",
  "Your WSOSO stays in your wallet. It only moves if a holder of {buying} accepts, and you can withdraw the offer at any time before that.":
    "你的 WSOSO 会留在你的钱包中。只有当{buying}的持有人接受时才会转出，在此之前你可以随时撤回出价。",
  "this piece": "这件藏品",
  "any piece in this collection": "该合集中任意藏品",
  "any piece with {trait} minted so far": "目前已铸造的任意带有 {trait} 的藏品",
  "any opened piece with {trait}": "任意已开盒且带有 {trait} 的藏品",
  "any piece with {trait} (1 piece)": "任意带有 {trait} 的藏品（1 件）",
  "any piece with {trait} ({count} pieces)": "任意带有 {trait} 的藏品（{count} 件）",

  /* ---------------------------------------------------------- offer dialog */
  "Make an offer on {name}": "对 {name} 出价",
  Close: "关闭",
  "Offers could not be loaded — the node would not serve event logs.": "无法加载出价：节点未提供事件日志。",
  "No offers on this one yet.": "这件藏品暂无出价。",

  /* ----------------------------------------------------------- offer inbox */
  "Offers you can take": "你可以接受的出价",
  "1 live offer": "1 个有效出价",
  "{count} live offers": "{count} 个有效出价",
  "Checking for offers on your pieces…": "正在检查你藏品上的出价…",
  "No offers on your pieces right now.": "你的藏品目前没有出价。",
  "Sold {piece} for {price}. It is in your balance above as WSOSO, which unwraps to SOSO one for one.":
    "已以 {price} 售出 {piece}。款项以 WSOSO 计入上方余额，可按 1:1 解包为 SOSO。",
  "for {trait} · ": "针对 {trait} · ",
  "for any piece · ": "针对任意藏品 · ",
  "wants {count} · ": "求购 {count} 件 · ",
  "from {maker}": "来自 {maker}",
  "Sell with": "出售藏品",
  "Which of your pieces to sell into this offer": "选择你要出售给该出价的藏品",
  "Sell up to {count}": "最多出售 {count} 件",
  "Working…": "处理中…",
  "Accept 1": "接受 1 件",
  "One approval per collection, then accept.": "每个合集授权一次，然后接受。",
  "The fee is taken in WSOSO from what you are paid.": "手续费以 WSOSO 从你收到的款项中扣除。",
  "Any piece": "任意藏品",

  /* ------------------------------------------------------- sell into offer */
  "#{id} is not in this offer's set.": "#{id} 不在该出价的范围内。",
  "Could not check your pieces just now.": "暂时无法检查你的藏品。",
  "Sell into this offer": "出售给该出价",
  "Sell into an offer": "出售给出价",
  "{maker} wants {wanted} at {price} each. You have {held} that qualify.":
    "{maker} 求购 {wanted} 件，每件 {price}。你有 {held} 件符合条件。",
  "The bidder’s WSOSO covers 1 piece right now, so that is the most you can sell into it.":
    "出价人的 WSOSO 目前仅够支付 1 件，因此这是你最多可以出售的数量。",
  "The bidder’s WSOSO covers {count} pieces right now, so that is the most you can sell into it.":
    "出价人的 WSOSO 目前仅够支付 {count} 件，因此这是你最多可以出售的数量。",
  "Checking the bidder’s funds…": "正在检查出价人的资金…",
  "Nothing can be sold into this offer right now.": "目前无法向该出价出售任何藏品。",
  "up to {max}": "最多 {max} 件",
  "Selling {pieces}": "出售 {pieces}",
  "Selling {pieces} and {more} more": "出售 {pieces} 等另外 {more} 件",
  "Choose which pieces": "选择藏品",
  "Hide the list": "收起列表",
  "Change which pieces": "更改所选藏品",
  "You receive {net} for 1 piece, after the {fee} fee. One transaction.":
    "扣除 {fee} 手续费后，你将收到 1 件藏品的 {net}。一笔交易完成。",
  "You receive {net} for {count} pieces, after the {fee} fee. One transaction.":
    "扣除 {fee} 手续费后，你将收到 {count} 件藏品的 {net}。一笔交易完成。",
  "Checking your pieces…": "正在检查你的藏品…",
  "Approve, then sell": "授权，然后出售",
  "Allow fee, then sell": "授权手续费，然后出售",
  "Sell {count}": "出售 {count} 件",
  "One approval per collection, then the sale.": "每个合集授权一次，然后出售。",

  /* ---------------------------------------------------------- piece picker */
  "Pieces to sell": "要出售的藏品",
  "{count} of {total} chosen": "已选 {count} / {total}",
  " · up to {cap}": " · 最多 {cap} 件",
  "First {cap}": "前 {cap} 件",
  None: "不选",

  /* -------------------------------------------------------------- bulk buy */
  "1 of your picks was just bought by someone else or taken down, so it is off your list.":
    "你选中的 1 件刚刚被他人买走或已下架，因此已从你的列表中移除。",
  "{gone} of your picks were just bought by someone else or taken down, so they are off your list.":
    "你选中的 {gone} 件刚刚被他人买走或已下架，因此已从你的列表中移除。",
  "1 of your picks has just gone to someone else, so this buys the other one.":
    "你选中的 1 件刚刚被他人买走，因此本次只购买另外 1 件。",
  "1 of your picks has just gone to someone else, so this buys the other {sent}.":
    "你选中的 1 件刚刚被他人买走，因此本次只购买另外 {sent} 件。",
  "{skipped} of your picks have just gone to someone else, so this buys the other one.":
    "你选中的 {skipped} 件刚刚被他人买走，因此本次只购买另外 1 件。",
  "{skipped} of your picks have just gone to someone else, so this buys the other {sent}.":
    "你选中的 {skipped} 件刚刚被他人买走，因此本次只购买另外 {sent} 件。",
  "1 piece": "1 件",
  "{count} pieces": "{count} 件",
  "You got {got} of {asked}. Someone else got the other one first, and you were not charged for it.":
    "你买到了 {asked} 件中的 {got}。另外 1 件已被他人抢先买走，你无需为其付款。",
  "You got {got} of {asked}. Someone else got the other {missed} first, and you were not charged for them.":
    "你买到了 {asked} 件中的 {got}。另外 {missed} 件已被他人抢先买走，你无需为其付款。",
  "Bulk buy": "批量购买",
  "Tap the pieces you want. Up to {max} at once.": "点选你想要的藏品。一次最多 {max} 件。",
  piece: "件",
  pieces: "件",
  " · the most one purchase can carry": " · 单次购买的上限",
  Clear: "清空",
  Buy: "购买",
  "Buy {count}": "购买 {count} 件",
  "Connect to buy": "连接钱包以购买",

  /* ------------------------------------------------------------- bulk list */
  "Put this one up for sale": "挂单出售这件藏品",
  "List several at once — {count} unlisted across {levels} levels, one price per level":
    "一次挂单多件：{levels} 个等级共 {count} 件未挂单，每个等级一个价格",
  "List several at once — {count} unlisted, one price per level": "一次挂单多件：{count} 件未挂单，每个等级一个价格",
  "List {count}": "挂单 {count} 件",
  "Which level to list": "选择要挂单的等级",
  "of {count} unlisted {level}": "共 {count} 件未挂单的{level}",
  "Choose which {level} pieces": "选择{level}藏品",
  "Listing nothing yet": "尚未选择要挂单的藏品",
  "Listing {pieces}": "挂单 {pieces}",
  "Listing {pieces} and {more} more": "挂单 {pieces} 等另外 {more} 件",
  "{level} pieces to list": "要挂单的{level}藏品",
  "{count} {level} piece in {batches} — you confirm each one. You keep {proceeds} if every piece sells.":
    "{count} 件{level}藏品，分 {batches}，每笔都需你确认。若全部售出，你将获得 {proceeds}。",
  "{count} {level} pieces in {batches} — you confirm each one. You keep {proceeds} if every piece sells.":
    "{count} 件{level}藏品，分 {batches}，每笔都需你确认。若全部售出，你将获得 {proceeds}。",
  "1 transaction": "1 笔交易",
  "{count} transactions": "{count} 笔交易",
  "Only your {level} pieces go up, at one price. Up to {max} per transaction.":
    "只有你的{level}藏品会以同一价格挂单。每笔交易最多 {max} 件。",
  "Listing… {done} of {total} transactions confirmed, {listed} pieces live.":
    "挂单中… 已确认 {total} 笔交易中的 {done} 笔，{listed} 件已上架。",
  "Done. {count} piece is listed.": "已完成。{count} 件已挂单。",
  "Done. {count} pieces are listed.": "已完成。{count} 件已挂单。",
  "Stopped after {listed} of {requested}. Those are listed and stay listed — run it again for the rest.":
    "已在 {requested} 件中的 {listed} 件后停止。这些藏品已挂单并将保持挂单，请再次运行以处理其余藏品。",
  "Check your wallet…": "请查看你的钱包…",
  "Approve once, then list": "授权一次，然后挂单",
  "List {count} {level}": "挂单 {count} 件{level}",
  Cancel: "取消",
  "Only {level} pieces are listed, all at the same price. Other levels, and {collection} pieces you have already listed, are not touched.":
    "只有{level}藏品会以同一价格挂单。其他等级，以及你已挂单的 {collection} 藏品，均不受影响。",
  "Seaport is not the contract this build expects. Nothing was sent.": "Seaport 不是此版本所预期的合约。没有发送任何交易。",
  "That price is not a number.": "该价格不是有效数字。",
  "The wallet rejected the transaction.": "钱包拒绝了该交易。",
  "Could not read your orders just now.": "暂时无法读取你的订单。",

  /* ----------------------------------------------------------- bulk cancel */
  "Withdraw several listings at once: {count} listed": "一次撤回多个挂单：已挂单 {count} 件",
  "Delist {count}": "下架 {count} 件",
  "Which listings to withdraw": "选择要撤回的挂单",
  "Withdraw {count} listing, asking {asking} in total, in {batches}. The pieces stay in your wallet, unlisted.":
    "撤回 {count} 个挂单，总标价 {asking}，分 {batches}。藏品将留在你的钱包中，处于未挂单状态。",
  "Withdraw {count} listings, asking {asking} in total, in {batches}. The pieces stay in your wallet, unlisted.":
    "撤回 {count} 个挂单，总标价 {asking}，分 {batches}。藏品将留在你的钱包中，处于未挂单状态。",
  "Withdraw {count} {level} listing, asking {asking} in total, in {batches}. The pieces stay in your wallet, unlisted.":
    "撤回 {count} 个{level}挂单，总标价 {asking}，分 {batches}。藏品将留在你的钱包中，处于未挂单状态。",
  "Withdraw {count} {level} listings, asking {asking} in total, in {batches}. The pieces stay in your wallet, unlisted.":
    "撤回 {count} 个{level}挂单，总标价 {asking}，分 {batches}。藏品将留在你的钱包中，处于未挂单状态。",
  "Withdrawing… {done} of {total} transactions confirmed, {cancelled} delisted.":
    "撤回中… 已确认 {total} 笔交易中的 {done} 笔，{cancelled} 件已下架。",
  "Done. {count} listing is withdrawn.": "已完成。{count} 个挂单已撤回。",
  "Done. {count} listings are withdrawn.": "已完成。{count} 个挂单已撤回。",
  "Stopped after {cancelled} of {requested}. Those are withdrawn. Run it again for the rest.":
    "已在 {requested} 个中的 {cancelled} 个后停止。这些挂单已撤回。请再次运行以处理其余挂单。",
  "Only your {collection} listings are withdrawn. You can list them again at a new price straight after.":
    "只有你在 {collection} 的挂单会被撤回。之后你可以立即以新价格重新挂单。",
  "Only your {level} {collection} listings are withdrawn. You can list them again at a new price straight after.":
    "只有你在 {collection} 的{level}挂单会被撤回。之后你可以立即以新价格重新挂单。",

  /* ----------------------------------------------------------- list prompt */
  "Pieces you could list": "你可以挂单的藏品",
  "You hold {count} piece that isn’t listed": "你持有 {count} 件未挂单的藏品",
  "You hold {count} pieces that aren’t listed": "你持有 {count} 件未挂单的藏品",
  Dismiss: "关闭",

  /* ---------------------------------------------------------------- unwrap */
  "Unwrap SOSO": "解包 SOSO",
  "Wrapped SOSO": "已包装的 SOSO",
  "Turn it back into SOSO": "将其换回 SOSO",
  Wrapped: "已包装",
  "Behind your offers": "用于你的出价",
  "Free to unwrap": "可解包",
  "WSOSO behind a live offer stays in your wallet — that is how an offer can stand without the marketplace holding your money. Unwrapping it would leave those offers unfillable, so it is held back. Withdraw the offer first to free it.":
    "用于有效出价的 WSOSO 会留在你的钱包中，这样出价才能在市场不托管你资金的情况下保持有效。解包这部分会使这些出价无法成交，因此会被保留。请先撤回出价以释放它。",
  "How much": "数量",
  Max: "最大",
  "More than is free — {amount} will be unwrapped.": "超出可解包的数量，将解包 {amount}。",
  "It arrives as SOSO in this wallet, one for one.": "它将以 1:1 的比例作为 SOSO 存入此钱包。",
  "Unwrapping…": "解包中…",
  "Nothing to unwrap": "没有可解包的金额",
  "Unwrap {amount}": "解包 {amount}",

  /* -------------------------------------------------------------- activity */
  Delisted: "已下架",
  "Collection offer": "合集出价",
  "This piece has since been burned": "这件藏品此后已被销毁",
  burned: "已销毁",
  "Block #{block}": "区块 #{block}",
  "{shown} of {total}": "{shown} / {total}",
  "1 event": "1 条记录",
  "{count} events": "{count} 条记录",
  "The node would not serve event logs just now, so this history could not be read. It is not empty — try again in a moment.":
    "节点暂时未提供事件日志，因此无法读取此历史记录。记录并非为空，请稍后再试。",
  "Nothing has traded here yet. Every sale, listing and offer made through this marketplace shows up here permanently.":
    "这里还没有任何交易。通过本市场进行的每一笔成交、挂单和出价都会永久显示在这里。",
  "Some event types could not be read, so this history is incomplete.": "部分事件类型无法读取，因此此历史记录不完整。",
  "See all {count} events": "查看全部 {count} 条记录",
  "Last sold": "最近成交",

  /* ----------------------------------------------------------- top holders */
  "Top holders": "主要持有人",
  "1 holder": "1 位持有人",
  "{count} holders": "{count} 位持有人",
  "The explorer would not answer just now, so this could not be read. It is not empty — try again in a moment.":
    "区块浏览器暂时没有响应，因此无法读取。数据并非为空，请稍后再试。",
  "Nothing has been minted here yet, so nobody holds any.": "这里还没有铸造任何藏品，因此没有持有人。",
  contract: "合约",
  "Show top {count}": "仅显示前 {count} 位",
  "See all {count} holders": "查看全部 {count} 位持有人",

  /* ------------------------------------------------------------- my offers */
  "Reading your offers from the chain…": "正在从链上读取你的出价…",
  "Reading this wallet's offers from the chain…": "正在从链上读取该钱包的出价…",
  "No standing offers. Anything you bid on shows here until it is taken, expires or you withdraw it.":
    "没有有效出价。你的每个出价都会显示在这里，直到被接受、过期或由你撤回。",
  "No standing offers from this wallet.": "该钱包没有有效出价。",
  committed: "已占用",
  Item: "藏品",
  Action: "操作",
  "Your offers": "你的出价",
  "Trait offer": "特征出价",
  "{left} of {total} left · ": "{total} 件剩余 {left} 件 · ",
  "Withdrawing…": "撤回中…",
  "1 older offer for this rarity doesn't include this piece: it was opened after the offer was placed.": "有 1 个较早的同稀有度出价不包含这件藏品：它是在该出价之后才开盒的。",
  "{count} older offers for this rarity don't include this piece: it was opened after they were placed.": "有 {count} 个较早的同稀有度出价不包含这件藏品：它是在这些出价之后才开盒的。",
  "Covers the first {bound} opened · {behind} opened since can't accept it": "覆盖最早开盒的 {bound} 件 · 之后开盒的 {behind} 件无法接受",
  Update: "更新",
  "Update this offer": "更新这个出价",
  "Places a new Any opened offer, which every opened piece can accept, including ones opened later. Then withdraws this one: two wallet prompts.": "先发布一个新的任意已开盒出价，所有已开盒藏品都能接受，包括之后才开盒的。然后撤回这个出价：钱包会提示两次。",
  "Places the same offer over the {count} pieces opened now, then withdraws this one: two wallet prompts.": "按目前已开盒的 {count} 件重新发布相同的出价，然后撤回这个出价：钱包会提示两次。",
  "This trait is not offered right now. Withdraw the offer instead.": "目前无法对这个特征出价。请改为撤回出价。",
};
