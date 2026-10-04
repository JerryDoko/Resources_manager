import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Open the native folder picker on the server's desktop.
 * Returns an absolute path, or null if cancelled / unavailable.
 */
export async function chooseFolderInFinder(
  prompt = "选择媒体文件夹"
): Promise<{ path: string | null; error?: string }> {
  if (process.platform === "win32") {
    try {
      const script = `
        [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = $env:RM_FOLDER_PROMPT
        $dialog.ShowNewFolderButton = $false
        $owner = New-Object System.Windows.Forms.Form
        $owner.TopMost = $true
        try {
          if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
            [Console]::Write($dialog.SelectedPath)
          }
        } finally {
          $dialog.Dispose()
          $owner.Dispose()
        }
      `;
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
        env: { ...process.env, RM_FOLDER_PROMPT: prompt },
        windowsHide: true,
        timeout: 180000,
        maxBuffer: 1024 * 1024,
      });
      return { path: stdout.trim() || null };
    } catch {
      return { path: null, error: "打开文件夹选择器失败，请手动输入绝对路径" };
    }
  }
  if (process.platform !== "darwin") {
    return {
      path: null,
      error: "当前系统不支持文件夹选择器，请手动输入绝对路径",
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
