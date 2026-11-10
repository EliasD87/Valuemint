/** Simplified Chinese for the header, menus, footer, search and wallet. See lib/i18n.zh.ts for the rules. */
export const ZH_SHELL: Record<string, string> = {
  Explore: "探索",
  Market: "市场",
  Mint: "铸造",
  Collections: "合集",
  Community: "社区",
  Portfolio: "资产",
  Trenches: "Trenches",
  "SoDEX KOLs": "SoDEX KOLs",
  "Free NFTs for SoDEX traders": "SoDEX 交易者的免费 NFT",
  "Portraits of the SoDEX KOLs": "SoDEX KOL 肖像",
  Free: "免费",

  /* Header, drawer and footer (components/Layout.tsx). */
  "Skip to content": "跳到正文",
  "ValueMint, home": "ValueMint 首页",
  Primary: "主导航",
  "Close menu": "关闭菜单",
  "Open menu": "打开菜单",
  "The marketplace for everything minted on ValueChain.": "ValueChain 上所有铸造藏品的交易市场。",
  More: "更多",
  Stats: "数据",
  "Getting started": "新手指南",
  "Marketplace contract": "市场合约",
  "Built on SoSoValue’s Layer 1.": "基于 SoSoValue 的 Layer 1 构建。",
  "ValueMint on X, @valuemintNFT": "ValueMint 的 X 账号 @valuemintNFT",
  "Gas settles in SOSO": "Gas 以 SOSO 结算",
  "Stop. This site is not talking to the contracts it should be.": "请立即停止。本网站连接的不是它应当连接的合约。",
  "Seaport names a ConduitController this app does not know.": "Seaport 指向了一个本应用不认识的 ConduitController。",
  "The WSOSO address has no contract code.": "WSOSO 地址上没有合约代码。",
  "Do not approve anything and do not send a transaction. Approving would grant blanket rights over your collection to whatever contract this is.":
    "请勿授权任何内容，也不要发送交易。授权会把你藏品的全部操作权限交给这个来历不明的合约。",

  /* Search (components/Search.tsx, and the text lib/search.ts builds). */
  "Search collections, pieces and addresses": "搜索合集、藏品和地址",
  "Search (press /)": "搜索（按 /）",
  Search: "搜索",
  "Collection, piece (Genesis 45) or 0x address": "合集、藏品（Genesis 45）或 0x 地址",
  "Loading collections…": "正在加载合集…",
  "No collections yet.": "暂无合集。",
  Collection: "合集",
  "Collection · {symbol}": "合集 · {symbol}",
  "Wallet {address}": "钱包 {address}",
  "See everything this address holds": "查看此地址持有的全部藏品",
  "Open as a collection": "作为合集打开",
  "For a contract this site has not listed yet": "适用于本站尚未收录的合约",
  "Open this piece": "打开这件藏品",
  "A ValueChain address is 0x followed by 40 hex characters.": "ValueChain 地址由 0x 加 40 个十六进制字符组成。",
  "Add the collection's name to find piece #{digits}: for example \"Genesis {digits}\".":
    "加上合集名称即可查找藏品 #{digits}，例如“Genesis {digits}”。",
  "No collection matches \"{query}\". Paste a 0x address to look up a wallet.":
    "没有与“{query}”匹配的合集。粘贴 0x 地址可查询钱包。",

  /* Wallet pill and menu (components/Wallet.tsx). The   keys are the parts hidden on a phone. */
  Connect: "连接",
  " wallet": "钱包",
  Connecting: "正在连接",
  " your wallet": "钱包",
  "Check your wallet…": "请在钱包中确认…",
  "Your wallet did not switch to ValueChain. Open the wallet you connected with, switch it to ValueChain, and try again.":
    "你的钱包未切换到 ValueChain。请打开你连接的钱包，切换到 ValueChain 后重试。",
  "Switch in your wallet": "请在钱包中切换",
  " — retry": "，重试",
  "Wrong network": "网络错误",
  " — switch in {wallet}": "，请在 {wallet} 中切换",
  " — switch": "，请切换",
  "Connected with {wallet}": "已通过 {wallet} 连接",
  Disconnect: "断开连接",
  Close: "关闭",
  Connected: "已连接",
  Copied: "已复制",
  Copy: "复制",
  Balance: "余额",
  "on {chain}": "位于 {chain}",
  "View on explorer": "在区块浏览器中查看",

  /* Wallet picker (components/WalletPicker.tsx). */
  "Connect a wallet": "连接钱包",
  "Phantom can't be used here: it doesn't support ValueChain. Connect with MetaMask or another wallet.":
    "此处无法使用 Phantom：它不支持 ValueChain。请使用 MetaMask 或其他钱包连接。",
  Installed: "已安装",
  "Another wallet": "其他钱包",
  "Scan a QR code, or open a wallet on your phone": "扫描二维码，或在手机上打开钱包",
  "No wallet found in this browser. {link} to continue.": "此浏览器中未找到钱包。请先{link}再继续。",
  "Install one": "安装一个钱包",
  "That request was cancelled in your wallet.": "该请求已在你的钱包中取消。",

  /* Theme switch. */
  "Switch to light theme": "切换到浅色主题",
  "Switch to dark theme": "切换到深色主题",
  Light: "浅色",
  Dark: "深色",

  /* Steadier RPC (components/FixNetworkButton.tsx). */
  "Sent to your wallet.": "已发送到你的钱包。",
  "Your wallet did not take the update.": "你的钱包未接受此更新。",
  "If it did not ask you, change it by hand: wallet settings, Networks, ValueChain, RPC URL {url}. Then try again.":
    "如果钱包没有弹出提示，请手动修改：钱包设置，网络，ValueChain，将 RPC URL 改为 {url}，然后重试。",
  "Switch my wallet to the steadier server": "将我的钱包切换到更稳定的服务器",

  /* Page tabs and info tips (labels their callers pass). */
  "Collection sections": "合集栏目",
  Items: "藏品",
  Activity: "动态",
  "Top holders": "主要持有人",
  "What this figure means": "这个数字的含义",

  /* Empty-balance help (components/SosoHelp.tsx, steps from config/guide.ts). */
  "How to get SOSO onto ValueChain": "如何把 SOSO 转到 ValueChain",
  "Where is my SOSO?": "我的 SOSO 在哪里？",
  "Your balance is empty": "你的余额为空",
  "Full guide": "完整指南",
  "Get SOSO onto ValueChain": "把 SOSO 转到 ValueChain",
  "Buy SOSO on SoDEX, then transfer it from your Spot account to your EVM wallet. It lands in the same wallet on ValueChain, ready to spend here.":
    "在 SoDEX 购买 SOSO，然后从现货账户转到你的 EVM 钱包。它会到达你在 ValueChain 上的同一个钱包，可直接在这里使用。",
  "Log in to SoDEX": "登录 SoDEX",
  "Connect the same wallet you use on ValueMint, then sign Enable Trading. Signing is free.":
    "连接你在 ValueMint 使用的同一个钱包，然后签名 Enable Trading。签名免费。",
  "Open SoDEX": "打开 SoDEX",
  "Deposit USDC": "充值 USDC",
  "Press Deposit and send USDC on Base or Ethereum. Check the minimum first — less is lost. Hold SOSO on Base or Ethereum? Deposit it and skip step 3.":
    "点击 Deposit，通过 Base 或 Ethereum 发送 USDC。请先确认最低金额，低于最低金额的充值会丢失。已在 Base 或 Ethereum 上持有 SOSO？直接充值并跳过第 3 步。",
  "Buy SOSO": "购买 SOSO",
  "On the SOSO/USDC market: Buy, Market, enter an amount, then Buy.": "在 SOSO/USDC 市场：选择 Buy、Market，输入数量，然后点击 Buy。",
  "Transfer to EVM": "转到 EVM",
  "Press Transfer and move SOSO from Spot to your EVM wallet — your wallet on ValueChain.":
    "点击 Transfer，把 SOSO 从现货账户转到你的 EVM 钱包，也就是你在 ValueChain 上的钱包。",
  "Connect here": "在这里连接",
  "Connect that same wallet on ValueMint. Keep a little SOSO back for gas.": "在 ValueMint 连接同一个钱包。留一点 SOSO 用作 Gas。",

  /* Wrapped SOSO row in the wallet menu. */
  Wrapped: "已包装",
  "for offers": "用于出价",
  "Unwrap to SOSO": "解包为 SOSO",
  "All of it is behind offers you have standing. Withdraw an offer to free it.": "全部已用于你当前的出价。撤回出价即可释放。",

  /* Share and address links. */
  "Copy failed": "复制失败",
  Share: "分享",
  "{address} — see what this wallet holds": "{address}：查看此钱包持有的藏品",

  /* Route error boundary (app/error.tsx). */
  "Something broke": "出错了",
  "This page didn’t load.": "此页面未能加载。",
  "The marketplace reads everything from the chain as you browse, so this is usually a node or gateway that failed to answer rather than anything wrong with your wallet or your pieces. Nothing was changed on chain.":
    "本市场在你浏览时从链上读取所有数据，所以这通常是节点或网关没有响应，而不是你的钱包或藏品出了问题。链上没有任何改动。",
  "Try again": "重试",
  "Go to Explore": "前往探索",
  Reference: "参考编号",
};
