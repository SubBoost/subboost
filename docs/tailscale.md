# Tailscale 节点 / Tailscale outbound

## 中文

SubBoost 可以生成 Mihomo 的 `type: tailscale` 出站节点。该节点没有 `server` / `port`，登录、状态目录、对端发现和重试都由客户端 Mihomo 负责。

### 客户端要求

- 需要包含 Tailscale 的 Mihomo 内核。v1.19.25 是基本功能的最低版本；推荐 v1.19.26 或更新的官方构建，链式代理相关修复也在其中。
- 自编译或第三方内核需要启用 `with_gvisor` 且不带 `no_tailscale`。仅凭版本号无法确认内核是否包含 Tailscale。

### 添加节点

1. 在“添加订阅/节点源”菜单中选择 **Tailscale 节点**。
2. 填写表单后点击“添加并导入”。点击“取消”不会创建任何导入源。
3. 节点保存为普通的 YAML 导入源，占用 YAML 源的数量配额。重新打开该源的高级编辑时会显示同一表单，也可以切换到 YAML 直接编辑。

也可以直接粘贴 YAML，最小写法为：

```yaml
proxies:
  - name: ts
    type: tailscale
```

### 字段说明

| 字段 | 说明 |
| --- | --- |
| `auth-key` | 可选。留空时，如果客户端没有可复用的登录状态，需要在 Mihomo 日志中打开登录链接。一次性密钥不能保证多台设备都能加入。 |
| `control-url` | 可选。留空使用 Tailscale 官方控制服务器，也可以填写 Headscale 的 HTTP/HTTPS 地址。SubBoost 只检查格式，不会访问该地址。 |
| `hostname` | 可选设备名。 |
| `state-dir` | 客户端本机的状态目录，由 Mihomo 解析。表单新建节点时会生成一次 `tailscale/subboost-<uuid>`，之后重命名、刷新或下载都不会改变它。导入的 YAML 保留原值。 |
| `exit-node` | 可选的出口节点 IP、设备名或 `auto:any`。这是本节点的出站选择，不会把本设备发布为出口节点。 |
| `ephemeral`、`udp`、`accept-routes`、`exit-node-allow-lan-access` | “默认”不写入该项，“启用”写入 `true`，“禁用”写入 `false`。SubBoost 不会自动为 Tailscale 添加 `udp: true`。 |

### 注意事项

- 应用表单只代表本地配置有效，不代表设备已经登录或加入 Tailnet。
- 访问公网目标需要可用的出口节点或已接受的覆盖路由。只能访问 Tailnet 的节点在公网 URL 测速中可能显示失败；节点仍会按现有规则参与分组和自动选择。
- 从 YAML 中移除 `accept-routes` 等偏好或清空 `exit-node`，不一定会重置客户端已保存的运行时偏好。
- 每台下载订阅的设备使用各自的本地状态目录，各自需要可用的登录方式。
- 链式代理请使用 SubBoost 的中转代理组；导入 YAML 中的 `dialer-proxy` 会按现有规则被移除。
- Mihomo 支持 `tailscale://<节点名>` DNS，SubBoost 不会自动添加或改写该 DNS 配置；引用时请使用最终生成的节点名。
- 回滚到不支持 Tailscale 的 SubBoost 版本后，旧版本会拒绝此类节点，可在 YAML 源中编辑或删除。回滚不会注销 Tailnet 设备或删除客户端状态。

## English

SubBoost can generate a Mihomo `type: tailscale` outbound. It has no `server` or `port`; the client Mihomo owns login, the state directory, peer discovery, and retries.

### Client requirements

- Use a Mihomo core that includes Tailscale. v1.19.25 is the minimum for basic support; an official v1.19.26 or newer build is recommended, including for chaining fixes.
- Custom or third-party cores must be built with `with_gvisor` and without `no_tailscale`. A version number alone does not prove Tailscale is included.

### Adding a node

1. Choose **Tailscale 节点** in the add-source menu.
2. Fill in the form and select “添加并导入” (add and import). Cancel creates no source.
3. The node is stored as an ordinary YAML source and counts toward the YAML source quota. Reopening the source shows the same form; you can also switch to raw YAML.

You can also paste YAML directly. The minimal form is:

```yaml
proxies:
  - name: ts
    type: tailscale
```

### Fields

| Field | Notes |
| --- | --- |
| `auth-key` | Optional. Without it, and without reusable client state, log in through the link in the Mihomo log. A single-use key does not enroll multiple devices. |
| `control-url` | Optional. Omit it for the Tailscale control server, or use a Headscale HTTP/HTTPS URL. SubBoost checks the syntax only and never contacts the URL. |
| `hostname` | Optional device name. |
| `state-dir` | Client-local directory resolved by Mihomo. A form-created node gets `tailscale/subboost-<uuid>` once; rename, refresh, and download keep it. Imported YAML keeps its value. |
| `exit-node` | Optional exit node IP, peer name, or `auto:any`. It selects an outbound exit; it does not advertise this device as an exit node. |
| `ephemeral`, `udp`, `accept-routes`, `exit-node-allow-lan-access` | Default omits the key, Enabled writes `true`, Disabled writes `false`. SubBoost never adds `udp: true` for Tailscale. |

### Notes

- Applying the form validates local configuration only; it does not mean the device has logged in or joined the Tailnet.
- Public destinations need a usable exit node or an accepted covering route. A node that reaches only Tailnet destinations can fail public URL tests; it still takes part in groups and automatic selection under the existing rules.
- Removing a preference such as `accept-routes` or clearing `exit-node` does not necessarily reset preferences the client already stored.
- Each device that downloads the subscription uses its own local state directory and needs its own usable login method.
- Use SubBoost relay groups for chaining; imported `dialer-proxy` fields are removed as before.
- Mihomo supports `tailscale://<proxy-name>` DNS. SubBoost does not add or rewrite such DNS settings; reference the final generated proxy name.
- SubBoost versions without Tailscale support reject these nodes after a rollback; edit or remove them in the YAML source. A rollback does not revoke Tailnet devices or delete client state.
