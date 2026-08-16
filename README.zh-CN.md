# 💰 dsh-deepseek-quota-plus

**简体中文** · [English](README.md)

DeepSeek API 额度插件(DeepSeek Harness / DSH Web 版):余额、今日消费、当前会话费用,一体化 UI(使用官方主题 token,明暗自适应)。

| 余额 | 今日消费 | 会话费用 | 快捷链接 |
| --- | --- | --- | --- |
| 总余额 / 充值 / 赠送,可用状态 | 官方(平台)或余额差值估算 | 实时计价 + 全量日志回放 | 充值 / 用量 / 发票 |

## ✨ 功能特性

- **输入工具行入口**:与模型选择同排的余额徽标按钮——默认透明,悬停才浮现背景,与原生工具行融为一体。
- **常驻读条**:输入框下方一行 `今日 ≈¥x.xx · 本会话 ¥x.xxx`(今日消费 · 当前会话费用)。
- **完整面板**:总余额 / 充值余额 / 赠送余额、可用状态、今日消费(标注 `官方` / `估算` 来源)、本会话费用、刷新时间。
- **一键跳转**:💰 充值 → `platform.deepseek.com/top_up`、📊 用量 → `/usage`、🧾 发票 → `/billing`。
- **官方精确消费**:在面板粘贴平台 `userToken`(经 credentials 服务持久化为 `DEEPSEEK_PLATFORM_TOKEN`),今日消费即走平台官方 dashboard 接口。
- **费用公式悬浮提示**:悬停查看 `输入/缓存命中/输出 tokens × 单价 = 小计`(按消息时刻官方价格表计价,含峰谷定价)。
- **零配置**:自动读取 DSH 的 `DEEPSEEK_API_KEY` 凭证(与模型提供商共用,无需手动填写)。
- **跟随主题**:全部使用 `--dsw-alias-*` 官方 token,明暗自适应。

## 🖼 截图

![DeepSeek 额度面板](docs/demo.jpeg)

## 📥 安装

需要 DSH CLI 与 [pnpm](https://pnpm.io/installation)。

```sh
dsh plugin --profile web add github:RicalLiu/dsh-deepseek-quota-plus
```

重启 Web 应用(`dsh web`),然后打开 http://127.0.0.1:3080 并刷新页面。

> 手动安装方式:把包安装到 profile 的 `node_modules`,并在 `~/.dsh/profiles/web/cordis.patch.yml` 添加加载条目:
>
> ```yaml
> - insert:
>     - id: deepseek-quota-plus
>       name: dsh-deepseek-quota-plus
> ```

## ⚙️ 配置

- **API Key**:自动读取 `DEEPSEEK_API_KEY`(在 **设置 → 模型** 中填写,或在启动环境中导出)。无需手动配置。
- **平台 token(可选,用于官方今日消费)**:
  1. 登录 [platform.deepseek.com](https://platform.deepseek.com)。
  2. 打开 DevTools → Console,执行:`JSON.parse(localStorage.getItem('userToken')).value`
  3. 在插件面板(💰 → "保存 token")中粘贴保存,或手动写入 `DEEPSEEK_PLATFORM_TOKEN` 到 `~/.dsh/.credentials.yaml`。

未配置 token 时,今日消费回退为余额差值估算(以 `≈` 前缀标注"估算")。

## 🏗 架构

| 部分 | 文件 | 职责 |
| --- | --- | --- |
| Host 半区 | `lib/index.js` | Cordis 插件,注册 `GET /api/deepseek-balance`、`GET /api/deepseek-session-cost`、`POST /api/deepseek-set-platform-token`;订阅 `session/event` 对每条 `assistant/message` 计价。 |
| 定价引擎 | `lib/pricing.js` | 官方价格表引擎(政策时间线 + 峰谷定价),移植自 [dsh-web-billing](https://github.com/bpc-oss/dsh-web-billing)(MIT)。 |
| 浏览器半区 | `lib/client.js` | `dsh.client` web bundle,注册工具行入口、composer dock 读条与 overlay 面板。 |
| 组合层 | `cordis.patch.yml` | `dsh.bundle` 补丁层,插入加载条目。 |

### 数据来源

1. **余额** — 官方 `GET https://api.deepseek.com/user/balance`(带 `DEEPSEEK_API_KEY`)。
2. **今日消费(官方)** — 平台 dashboard `platform.deepseek.com/api/v0/usage/cost?month=&year=`(带 `DEEPSEEK_PLATFORM_TOKEN`)。私有接口,可能随时变更。
3. **今日消费(估算)** — 余额差值(`max(0, 当日开盘余额 − 当前余额)`),持久化到 `$DSH_HOME/storages/deepseek-quota-day.json`。
4. **会话费用** — 每条 `assistant/message` 按官方价格表计价;整段会话从持久化日志全量回放,包含插件安装前的历史。

## 🔒 安全

- API Key / 平台 token 永不出本机:浏览器只访问 Host 半区注册的本地路由。
- token 经 DSH credentials 服务存储,绝不回显到 UI。

## 🙏 致谢

- [dsh-deepseek-quota](https://github.com/yingjunnan/dsh-deepseek-quota)(MIT)— 本项目重构的原始余额组件;网络层、会话费用回放与日差值逻辑源自于此。
- [dsh-web-billing](https://github.com/bpc-oss/dsh-web-billing)(MIT)— 官方定价引擎。
- [dsh-balance-plugin](https://github.com/Francis-Xavier-code/dsh-balance-plugin)— 输入工具行入口布局参考。

完整的第三方归属声明见 [NOTICE](NOTICE);项目贡献者见 [AUTHORS](AUTHORS)。

## 📄 许可证

MIT
