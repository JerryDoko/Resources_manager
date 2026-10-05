import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
const python = path.join("runtime/kokoro/bundle", `${process.platform}-${process.arch}`, "python", process.platform === "win32" ? "python.exe" : "bin/python3");
test("替代引擎保留数字含义、音色和长文本边界，不加载旧 GPL 引擎", { timeout: 60000 }, () => {
  const output = execFileSync(python, ["-c", `
import sys, pathlib
sys.path.insert(0,'runtime/kokoro')
from ort_engine import KokoroEngine,normalize_numbers,chinese_integer,english_integer
assert chinese_integer('10001')=='一万零一'
assert chinese_integer('100000001')=='一亿零一'
assert chinese_integer('1010')=='一千零一十'
assert english_integer(123)=='one hundred twenty three'
assert normalize_numbers('今天是2026-10-05，比例25%，金额-123.45元。')=='今天是二零二六年十月五日，比例百分之二十五，金额负一百二十三点四五元。'
assert 'one hundred twenty three' in normalize_numbers('Price 123 dollars')
assert 'sherpa_onnx' not in sys.modules
model=pathlib.Path(sys.argv[1]);engine=KokoroEngine(model,2)
assert engine.num_speakers==103 and engine.sample_rate==24000
groups=engine.tokenize('长段落，必须保留所有正文。'*80)
assert len(groups)>1 and all(0<len(g)<engine.max_tokens-1 for g in groups)
assert engine.tokenize('unknownzzword')
try: engine.generate('测试',sid=103)
except ValueError: pass
else: raise AssertionError('invalid speaker accepted')
assert not (model/'espeak-ng-data').exists()
print('OK')
`, path.resolve("runtime/kokoro/bundle", `${process.platform}-${process.arch}`, "model")], { encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(output.trim(), "OK");
});
