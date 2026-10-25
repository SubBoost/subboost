const VLESS_MLKEM_ENCRYPTION_PATTERN =
  /^mlkem768x25519plus\.(?:native|xorpub|random)\.(?:1rtt|0rtt)\.[A-Za-z0-9+/=_-]+(?:\.[A-Za-z0-9+/=_-]+)*$/;

export function isVlessMlkemEncryption(value: string): boolean {
  return VLESS_MLKEM_ENCRYPTION_PATTERN.test(value);
}
