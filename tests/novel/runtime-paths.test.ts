import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveKokoroResourceRoot } from '../../src/lib/novel/runtime-paths';
const files = ['install.mjs', 'kokoro_worker.py', 'ort_engine.py'];
const existsIn = (root: string) => (file: string) => files.some(name => file === path.join(root, name));
test('声音路径兼容源码、standalone 和安装目录，不在 server 内寻找脚本',()=>{
  const project=path.resolve('path-fixture');
  const source=path.join(project,'runtime','kokoro');
  assert.equal(resolveKokoroResourceRoot({cwd:project,configuredRoot:'',resourceRoot:'',exists:existsIn(source)}),source);
  assert.equal(resolveKokoroResourceRoot({cwd:path.join(project,'dist-pack','server'),configuredRoot:'',resourceRoot:'',exists:existsIn(source)}),source);
  const resources=path.join(project,'resources'),packaged=path.join(resources,'kokoro');
  assert.equal(resolveKokoroResourceRoot({cwd:path.join(resources,'server'),configuredRoot:'',resourceRoot:'',exists:existsIn(packaged)}),packaged);
});
test('显式资源路径优先，兼容 resource-dir 环境变量',()=>{
  const cwd=path.resolve('path-fixture'),root=path.join(cwd,'external-kokoro');
  assert.equal(resolveKokoroResourceRoot({cwd,configuredRoot:root,resourceRoot:path.join(cwd,'other')}),root);
  assert.equal(resolveKokoroResourceRoot({cwd,configuredRoot:'',resourceRoot:root}),root);
});
