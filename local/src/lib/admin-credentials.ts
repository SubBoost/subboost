export const LOCAL_ADMIN_PASSWORD_MIN_LENGTH = 10;

export const LOCAL_ADMIN_CREDENTIAL_MESSAGES = {
  invalidJson: "请求格式有误，请刷新页面后重试",
  adminExists: "已有管理员账号，请直接登录",
  usernameRequired: "请输入管理员账号",
  passwordMinLength: `密码至少需要 ${LOCAL_ADMIN_PASSWORD_MIN_LENGTH} 个字符`,
  passwordMismatch: "两次输入的密码不一致，请重新确认",
} as const;

export const LOCAL_ACCOUNT_MANAGEMENT_MESSAGES = {
  usernameExists: "用户名已存在",
  userNotFound: "账号不存在",
  cannotDeleteSelf: "不能删除当前登录的账号",
  cannotDeleteAdmin: "不能删除管理员账号",
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
