export async function novelRequest<T>(profileId: string, action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/novel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, profileId, action }), signal, keepalive: action === "progress" || action === "cancel" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "小说请求失败");
  return data as T;
}
