export class NovelConnectionError extends Error {
  constructor(){super("无法连接本地小说服务。请重新启动 Resources Manager 内置窗口，再重新连接；关闭内置窗口会停止服务。");this.name="NovelConnectionError";}
}
export async function novelFetch(input:string,init?:RequestInit):Promise<Response>{
  try{return await fetch(input,init);}
  catch(error){if(error instanceof TypeError)throw new NovelConnectionError();throw error;}
}
export async function novelRequest<T>(profileId: string, action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await novelFetch("/api/novel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, profileId, action }), signal, keepalive: action === "progress" || action === "cancel" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "小说请求失败");
  return data as T;
}
