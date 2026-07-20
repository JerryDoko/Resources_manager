import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Open native macOS Finder folder picker via AppleScript.
 * Returns absolute POSIX path, or null if cancelled / unavailable.
 */
export async function chooseFolderInFinder(
  prompt = "选择媒体文件夹"
): Promise<{ path: string | null; error?: string }> {
  if (process.platform !== "darwin") {
    return {
      path: null,
      error: "访达选择仅支持 macOS，请手动输入绝对路径",
    };
  }

  try {
    const script = `POSIX path of (choose folder with prompt "${prompt.replace(/"/g, '\\"')}")`;
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 180000,
      maxBuffer: 1024 * 1024,
    });
    const folderPath = stdout.trim().replace(/\/$/, "");
    return { path: folderPath || null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // User pressed Cancel
    if (/User canceled|取消|-128/i.test(msg)) {
      return { path: null };
    }
    return { path: null, error: msg };
  }
}
