# 自托管访问与更新 / Self-hosted access and updates

## 访问方式

新安装默认只把应用端口绑定到服务器的 `127.0.0.1`。在自己的电脑上建立 SSH 隧道，将下面的 `端口`、`用户名`和`服务器地址`替换成实际值：

```sh
ssh -L 端口:127.0.0.1:端口 用户名@服务器地址
```

保持 SSH 连接，然后在电脑浏览器中打开安装器打印的地址和初始化链接。初始化链接含有令牌，请勿分享。也可以选择 `https`：先配置支持 HTTPS 的反向代理和证书，让代理转发到安装器显示的 `http://127.0.0.1:端口`，再使用代理的 HTTPS 地址。安装器不会安装证书或配置代理。

选择 `ssh` 或 `https` 时，安装器会检查实际生效的 Compose 端口映射；如果自定义配置没有按所选地址绑定应用端口，安装会停止。选择 `public-http` 并使用自定义 Compose 时，请自行确认映射允许预期网络访问。新版管理器会检查并保留已有映射；如候选配置不兼容，请使用保留原地址和端口的 Compose 文件。旧配置若为应用发布了多个端口或使用 host 网络模式，自动更新会停止，请先手动核对。标准新安装和标准旧版开放映射可以不安装额外解析工具；某些受限更新或复杂配置需要 Python 3、Node.js 或 jq 中的任意一个，若提示缺少解析工具，请先安装其中一个再重试。

Docker Engine 28 以前的版本可能允许同一二层网络上的其他主机访问绑定到本机的端口。建议更新 Docker；不能更新时，请另行隔离网络并验证访问限制。自定义 Docker 直接路由和防火墙规则也可能影响实际暴露范围。参见 [Docker 端口发布说明](https://docs.docker.com/engine/network/port-publishing/)。

安装器也提供显式的 `public-http` 选项，只适用于受信任的网络：HTTP 不加密，网络上的其他人可能读取设置令牌、密码和会话。非交互安装通过 `SUBBOOST_ACCESS_MODE=ssh|https|public-http` 选择；选择 `https` 或 `public-http` 时可用 `APP_URL` 指定外部地址，例如 `APP_URL=https://local.subboost.test`。`SUBBOOST_PORT` 控制应用端口。HTTPS 的外部端口与应用端口可以不同，需在代理中配置转发。

新安装在环境文件中保存 `SUBBOOST_BIND_ADDRESS` 和 `SUBBOOST_PORT`。更改后须重新创建应用容器才能生效；已有安装更新时没有地址变量则保留原端口映射。请同时检查服务器防火墙与反向代理配置。

## 旧管理器的首次安全更新

安装了较旧管理器的用户，在包含本指南的版本发布后，可运行以下命令完成首次更新。请使用安装目录的所有者执行；如果安装属于 root，先用 `sudo -i` 进入 root shell。命令会在私有随机临时目录下载当前管理器，并由该管理器执行正常更新。若发布元数据不可用，或其中的管理器与下载版本不同，更新会停止；稍后重试。自定义更新源需要先提供相同的新管理器。之后可继续使用 `subboost update`。

旧管理器直接执行 `subboost update` 时不会检查实际端口映射，可能扩大自定义配置原本的访问范围。若旧 Compose 手动绑定了 `127.0.0.1`，而安装目录的 `.env` 中没有 `SUBBOOST_BIND_ADDRESS`，请先在该文件中加入 `SUBBOOST_BIND_ADDRESS=127.0.0.1`，再通过下面的命令完成首次更新。新版管理器仍会验证候选 Compose 是否实际使用该地址。

```sh
(
  umask 077
  update_dir="$(mktemp -d "${TMPDIR:-/tmp}/subboost-update.XXXXXXXXXX")" || exit 1
  trap 'rm -rf -- "$update_dir"' EXIT
  trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM
  curl -fsSL https://github.com/SubBoost/subboost/releases/latest/download/subboost-manager -o "$update_dir/manager" || exit 1
  grep -q SUBBOOST_REQUIRE_MANAGER_UPDATE "$update_dir/manager" || { echo '新版管理器尚不可用，请稍后重试。' >&2; exit 1; }
  SUBBOOST_REQUIRE_MANAGER_UPDATE=1 bash "$update_dir/manager" update
)
```

## Access options

New installations bind the application port to `127.0.0.1` on the server by default. From your own computer, establish an SSH tunnel, replacing the placeholders with the selected port and your server login:

```sh
ssh -L port:127.0.0.1:port user@server
```

Keep the SSH connection open and open the printed address and setup link in your browser. The setup link contains a token; do not share it. Alternatively, select `https` after configuring a reverse proxy and certificate to forward requests to the displayed `http://127.0.0.1:port`. The installer does not install a certificate or configure the proxy.

For `ssh` and `https`, the installer checks the resolved Compose port mappings and stops if a custom configuration does not bind the application port to the selected address. When using `public-http` with a custom Compose file, check that its mapping allows access from the intended network. The new manager checks and preserves the existing mapping; if the candidate is incompatible, use a Compose file that keeps the original address and port. Automatic update stops for an existing configuration with multiple published application ports or host networking; inspect the configuration first. Standard new installations and standard older open mappings work without extra parsing tools. Some restricted updates or complex configurations need Python 3, Node.js, or jq; if prompted, install one and retry.

Before Docker Engine 28, other hosts on the same layer 2 network may be able to reach ports bound to localhost. Upgrade Docker or isolate the network and verify the restriction. Custom Docker direct routing and firewall rules can also affect exposure. See [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/).

The explicit `public-http` option is for trusted networks only: HTTP does not encrypt setup tokens, passwords, or sessions. For noninteractive installation set `SUBBOOST_ACCESS_MODE=ssh|https|public-http`; for `https` or `public-http`, set `APP_URL` to the external address, for example `APP_URL=https://local.subboost.test`. `SUBBOOST_PORT` controls the application port. The external HTTPS port can differ from the application port; configure the proxy accordingly.

New installations save `SUBBOOST_BIND_ADDRESS` and `SUBBOOST_PORT` in the environment file. Recreate the application container after changing them. Updates preserve the original port mapping when an existing installation lacks the address setting. Also check the server firewall and reverse proxy configuration.

## First secure update from an older manager

Once the version containing this guide is released, an installation with an older manager can run the command above. Run it as the owner of the installation directory; if root owns the installation, enter a root shell first with `sudo -i`. The command downloads the current manager into a private random temporary directory and uses it to perform the normal update. The update stops if release metadata is unavailable or names a different manager; retry later. A custom update source must first provide the same new manager. Subsequent updates can use `subboost update`.

An older manager does not check the actual port mapping when running `subboost update` directly, which can widen access from a custom configuration. If the old Compose file binds to `127.0.0.1` manually and the installation's `.env` has no `SUBBOOST_BIND_ADDRESS`, first add `SUBBOOST_BIND_ADDRESS=127.0.0.1` to that file, then use the command above for the first update. The new manager still verifies that the candidate Compose file actually uses that address.
