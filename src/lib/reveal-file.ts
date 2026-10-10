export async function revealLocalFile(path: string) {
  if (window.rmDesktop?.revealItem) {
    if (!await window.rmDesktop.revealItem(path)) throw new Error("文件已移动、删除或无法打开存储位置");
    return;
  }
  const response = await fetch("/api/system/reveal", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({path}), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "无法打开存储位置");
  }
}
