# SubBoost v2.12.0

## 中文

- 新增 Tailscale 节点配置与表单编辑，可在订阅源中单独管理 Tailscale 节点。认证密钥会随订阅配置传递，请妥善保管订阅链接。
- 改善规则和代理组编辑，修复移动、停用及重命名后的规则目标、顺序和引用保持问题。
- 首页模板选择支持“我的模板”，修复应用模板后覆盖正在编辑的订阅信息的问题。
- 完善未保存内容提醒，并改善短屏弹窗和长节点列表的操作体验。
- 改善自部署更新与访问地址处理，更新时保留自定义端口绑定。
- 加强登录、订阅解析和规则获取的安全性，并更新受影响的依赖。

升级说明：建议先备份现有实例，再通过 `subboost update` 更新。

## English

- Added Tailscale node configuration and form editing, with separate management of Tailscale nodes within subscription sources. Authentication keys are included in subscription configurations, so keep subscription links private.
- Improved rule and proxy group editing, fixing target, order, and reference preservation after moving, disabling, or renaming entries.
- Added “My Templates” to the home template picker and fixed applied templates overwriting information for the subscription being edited.
- Improved unsaved input warnings and made dialogs on short screens and long node lists easier to use.
- Improved self-hosted updates and access URL handling, preserving custom port bindings during updates.
- Strengthened login, subscription parsing, and rule fetching security, and updated affected dependencies.

Upgrade: Back up the existing instance, then update with `subboost update`.
