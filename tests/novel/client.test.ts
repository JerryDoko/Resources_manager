import test from "node:test";
import assert from "node:assert/strict";
import { NovelConnectionError, novelFetch, novelRequest } from "../../src/lib/novel/client";

test("连接中断显示本地服务提示，恢复连接后可以重新请求",async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw new TypeError("Failed to fetch");};
    await assert.rejects(()=>novelRequest("default","install-runtime",{directory:"/model"}),error=>error instanceof NovelConnectionError && error.message.includes("重新启动") && !error.message.includes("Failed to fetch"));
    globalThis.fetch=async()=>Response.json({profileId:"default",available:true});
    assert.deepEqual(await (await novelFetch("/api/novel?action=context")).json(),{profileId:"default",available:true});
  }finally{globalThis.fetch=original;}
});
test("模型校验等服务端错误不会误报成网络错误",async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>Response.json({error:"声音包文件无效"},{status:400});
    await assert.rejects(()=>novelRequest("default","install-runtime"),error=>error instanceof Error && !(error instanceof NovelConnectionError) && error.message==="声音包文件无效");
  }finally{globalThis.fetch=original;}
});
test("主动取消请求仍保留 AbortError",async()=>{
  const original=globalThis.fetch,error=new DOMException("Aborted","AbortError");
  try{
    globalThis.fetch=async()=>{throw error;};
    await assert.rejects(()=>novelFetch("/api/novel"),actual=>actual===error);
  }finally{globalThis.fetch=original;}
});
