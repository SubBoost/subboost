export const LOCAL_ADMIN_PASSWORD_MIN_LENGTH = 10;

export const LOCAL_ADMIN_CREDENTIAL_MESSAGES = {
  invalidJson: "请求格式有误，请刷新页面后重试",
  adminExists: "已有管理员账号，请直接登录",
  usernameRequired: "请输入管理员账号",
  passwordMinLength: `密码至少需要 ${LOCAL_ADMIN_PASSWORD_MIN_LENGTH} 个字符`,
  passwordMismatch: "两次输入的密码不一致，请重新确认",
  lanModeSetupDisabled: "局域网模式下默认管理员由系统自动管理，已禁用创建管理员账号接口",
} as const;

type LocalAdminCredentialInput = {
  username: string;
  password: string;
  passwordConfirm: string;
};

export function getLocalAdminSetupCredentialError(input: LocalAdminCredentialInput): string {
  const username = input.username.trim();
  const password = input.password.trim();
  const passwordConfirm = input.passwordConfirm.trim();

  if (!username) return LOCAL_ADMIN_CREDENTIAL_MESSAGES.usernameRequired;
  if (password.length < LOCAL_ADMIN_PASSWORD_MIN_LENGTH) return LOCAL_ADMIN_CREDENTIAL_MESSAGES.passwordMinLength;
  if (password !== passwordConfirm) return LOCAL_ADMIN_CREDENTIAL_MESSAGES.passwordMismatch;
  return "";
}
