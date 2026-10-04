import test from "node:test";
import assert from "node:assert/strict";
import { publicAddress, resolvePageAddress } from "../../src/lib/novel/web-address";

test("代理虚拟 IP 通过公共 DNS 重新解析，返回真实公网地址", async () => {
  let queries = 0;
  const chosen = await resolvePageAddress("wcshuba.com", undefined, {
    system: async () => [{ address: "198.18.0.100", family: 4 }],
    publicDNS: async host => {
      assert.equal(host, "wcshuba.com");
      queries++;
      return [{ address: "104.21.67.53", family: 4 }];
    },
  });
  assert.equal(queries, 1);
  assert.equal(chosen.address, "104.21.67.53");
});

test("真实公网解析不调用备用 DNS", async () => {
  const chosen = await resolvePageAddress("example.org", undefined, {
    system: async () => [{ address: "8.8.8.8", family: 4 }],
    publicDNS: async () => { throw new Error("unexpected fallback"); },
  });
  assert.equal(chosen.address, "8.8.8.8");
});

test("内网 IP、内网域名和混合私网解析继续被拒绝", async () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "::1", "::ffff:127.0.0.1", "198.18.0.100"]) {
    assert.equal(publicAddress(address), false);
    await assert.rejects(resolvePageAddress(address), /内网/);
  }
  for (const addresses of [
    [{ address: "10.0.0.1", family: 4 }],
    [{ address: "198.18.0.100", family: 4 }, { address: "192.168.1.1", family: 4 }],
    [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }],
  ]) {
    await assert.rejects(resolvePageAddress("example.org", undefined, {
      system: async () => addresses,
      publicDNS: async () => { throw new Error("unexpected fallback"); },
    }), /内网/);
  }
});

test("公共 DNS 的私网、虚拟或空回答也被拒绝", async () => {
  for (const addresses of [[], [{ address: "127.0.0.1", family: 4 }], [{ address: "198.18.0.101", family: 4 }]]) {
    await assert.rejects(resolvePageAddress("example.org", undefined, {
      system: async () => [{ address: "198.18.0.100", family: 4 }],
      publicDNS: async () => addresses,
    }), /内网/);
  }
});
