import { lstat, readFile, writeFile } from "node:fs/promises";

const STATE_FILE = "/run/subboost-web-update/state/status";
const REQUEST_FILE = "/run/subboost-web-update/request/pending";

export type WebUpdateStatus = "disabled" | "idle" | "queued" | "running" | "succeeded" | "failed";

export async function getWebUpdateStatus(): Promise<WebUpdateStatus> {
  const state = await readFile(STATE_FILE, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const status = state?.trim();
  if (status !== "idle" && status !== "running" && status !== "succeeded" && status !== "failed") {
    return "disabled";
  }
  if (status === "running") return status;
  const pending = await lstat(REQUEST_FILE).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  return pending ? "queued" : status;
}

export async function queueWebUpdate(): Promise<"disabled" | "busy" | "queued"> {
  const status = await getWebUpdateStatus();
  if (status === "disabled") return status;
  if (status === "running" || status === "queued") return "busy";

  try {
    await writeFile(REQUEST_FILE, "", { flag: "wx", mode: 0o600 });
    return "queued";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return "busy";
    throw error;
  }
}
