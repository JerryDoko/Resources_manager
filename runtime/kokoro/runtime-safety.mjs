import fs from 'node:fs';
import path from 'node:path';
export const ENGINE_ID = 'kokoro-ort-lexicon-v1';
export function assertVoiceRuntime(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (/sherpa[_-]onnx|espeak|piper[_-]phonemize/i.test(entry.name)) throw new Error('声音包含旧 GPL 引擎，请重新安装新声音包，或选择原模型目录');
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('声音包不能包含外部符号链接');
    if (entry.isDirectory()) assertVoiceRuntime(file);
  }
}
