"""Kokoro inference using MIT-licensed ONNX Runtime and model-supplied lexicons.

No eSpeak, piper-phonemize or sherpa-onnx is imported or executed. Model tensor
shapes and voices come from the model metadata, rather than a fixed voice list.
"""
import re
from pathlib import Path

import numpy as np
import onnxruntime as ort

ENGINE_ID = "kokoro-ort-lexicon-v1"
HAN = re.compile(r"[\u3400-\u9fff]")
DIGITS_ZH = "零一二三四五六七八九"
EN_SMALL = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
EN_TENS = "zero ten twenty thirty forty fifty sixty seventy eighty ninety".split()


def chinese_integer(value):
    number = int(value)
    if not number:
        return "零"
    if number >= 10**16:
        return "".join(DIGITS_ZH[int(c)] for c in str(number))
    groups = []
    while number:
        groups.append(number % 10000)
        number //= 10000
    result, pending_zero = "", False
    for index in range(len(groups) - 1, -1, -1):
        group = groups[index]
        if not group:
            pending_zero = bool(result)
            continue
        if result and (pending_zero or group < 1000):
            result += "零"
        pending_zero = False
        part, gap = "", False
        for power, unit in ((1000, "千"), (100, "百"), (10, "十"), (1, "")):
            digit, group = divmod(group, power)
            if digit:
                if gap:
                    part += "零"
                part += DIGITS_ZH[digit] + unit
                gap = False
            elif part and group:
                gap = True
        result += part + ("", "万", "亿", "万亿")[index]
    return result[1:] if result.startswith("一十") else result


def english_integer(number):
    number = int(number)
    if number < 20:
        return EN_SMALL[number]
    if number < 100:
        tens, ones = divmod(number, 10)
        return EN_TENS[tens] + (" " + EN_SMALL[ones] if ones else "")
    if number < 1000:
        hundreds, rest = divmod(number, 100)
        return EN_SMALL[hundreds] + " hundred" + (" " + english_integer(rest) if rest else "")
    for scale, name in ((10**15, "quadrillion"), (10**12, "trillion"), (10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if number >= scale:
            head, tail = divmod(number, scale)
            return english_integer(head) + " " + name + (" " + english_integer(tail) if tail else "")


def normalize_numbers(text):
    chinese = bool(HAN.search(text))
    def digits(value):
        return "".join(DIGITS_ZH[int(c)] for c in value) if chinese else " ".join(EN_SMALL[int(c)] for c in value)
    integer = chinese_integer if chinese else english_integer
    if chinese:
        text = re.sub(r"(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)", lambda m: digits(m[1]) + "年" + integer(m[2]) + "月" + integer(m[3]) + "日", text)
        text = re.sub(r"(\d{4})年", lambda m: digits(m[1]) + "年", text)
        text = re.sub(r"(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)", lambda m: integer(m[1]) + "点" + integer(m[2]) + "分" + (integer(m[3]) + "秒" if m[3] else ""), text)
    text = re.sub(r"(?<=\d),(?=\d{3}(?:\D|$))", "", text)
    text = re.sub(r"(?<=\d)[-–](?=\d)", "到" if chinese else " to ", text)
    text = re.sub(r"(?<![A-Za-z0-9])[-−](?=\d)", "负" if chinese else " minus ", text)
    def convert(match):
        raw, percent = match[1], match[2]
        whole, dot, fraction = raw.partition(".")
        if len(whole) >= 11 or (len(whole) > 1 and whole.startswith("0")):
            spoken = digits(whole)
        else:
            spoken = integer(whole)
        if dot:
            spoken += ("点" if chinese else " point ") + digits(fraction)
        if percent:
            spoken = "百分之" + spoken if chinese else spoken + " percent"
        return spoken if chinese else " " + spoken + " "
    return re.sub(r"(\d+(?:\.\d+)?)([%％]?)", convert, text)


class KokoroEngine:
    def __init__(self, directory, threads=2):
        directory = Path(directory)
        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, min(32, int(threads)))
        options.inter_op_num_threads = 1
        options.log_severity_level = 3
        self.session = ort.InferenceSession(str(next(directory.glob("*.onnx"))), sess_options=options, providers=["CPUExecutionProvider"])
        metadata = self.session.get_modelmeta().custom_metadata_map
        if metadata.get("model_type") != "kokoro":
            raise ValueError("请选择 Kokoro 模型")
        self.sample_rate = int(metadata["sample_rate"])
        self.num_speakers = int(metadata["n_speakers"])
        dimensions = tuple(int(v) for v in metadata["style_dim"].split(","))
        if len(dimensions) != 3 or dimensions[1] != 1:
            raise ValueError("不支持的 Kokoro 音色格式")
        self.max_tokens, _, width = dimensions
        self.styles = np.fromfile(directory / "voices.bin", dtype="<f4").reshape(self.num_speakers, self.max_tokens, width)
        self.tokens = {}
        for line in (directory / "tokens.txt").read_text(encoding="utf-8").splitlines():
            token, value = line.rsplit(" ", 1)
            self.tokens[token] = int(value)
        self.lexicon = {}
        for filename in ("lexicon-us-en.txt", "lexicon-zh.txt"):
            for line in (directory / filename).read_text(encoding="utf-8").splitlines():
                parts = line.split()
                if len(parts) >= 2 and all(phone in self.tokens for phone in parts[1:]):
                    self.lexicon[parts[0]] = tuple(self.tokens[p] for p in parts[1:])
        self.word_lengths = {}
        for word in self.lexicon:
            if HAN.match(word):
                self.word_lengths[word[0]] = max(self.word_lengths.get(word[0], 1), len(word))
        self.input_names = [value.name for value in self.session.get_inputs()]
        if self.input_names != ["tokens", "style", "speed"]:
            raise ValueError("不支持的 Kokoro 模型输入格式")

    def tokenize(self, text):
        text = normalize_numbers(text).translate(str.maketrans({"，": ",", "。": ".", "！": "!", "？": "?", "；": ";", "：": ":", "、": ",", "‘": "'", "’": "'"}))
        groups, current = [], []
        def append(values):
            nonlocal current
            for value in values:
                if len(current) >= self.max_tokens - 2:
                    groups.append(current)
                    current = []
                current.append(value)
        index = 0
        while index < len(text):
            character = text[index]
            if HAN.match(character):
                length = min(self.word_lengths.get(character, 1), len(text) - index)
                while length > 1 and text[index:index + length] not in self.lexicon:
                    length -= 1
                word = text[index:index + length]
                if word not in self.lexicon:
                    raise ValueError("模型词典不支持部分汉字，请更换模型或段落")
                append(self.lexicon[word])
                index += length
                continue
            word = re.match(r"[A-Za-z]+(?:'[A-Za-z]+)?", text[index:])
            if word:
                word = word[0].lower()
                if word in self.lexicon:
                    append(self.lexicon[word])
                else:
                    # Preserve unknown Latin words by spelling, rather than dropping them.
                    for letter in word:
                        if letter.isalpha():
                            if letter not in self.lexicon:
                                raise ValueError("模型词典缺少英文字母读音")
                            append(self.lexicon[letter])
                            if " " in self.tokens:
                                append([self.tokens[" "]])
                if " " in self.tokens:
                    append([self.tokens[" "]])
                index += len(word)
                continue
            if character in self.tokens:
                append([self.tokens[character]])
                if character in ".!?;" and len(current) >= 80:
                    groups.append(current)
                    current = []
            elif not character.isspace() and character.isalnum():
                raise ValueError("当前模型仅支持中文和英文字母")
            index += 1
        if current:
            groups.append(current)
        return groups

    def generate(self, text, sid, speed=1.0):
        if not 0 <= sid < self.num_speakers or speed <= 0:
            raise ValueError("音色编号或语速无效")
        samples = []
        for group in self.tokenize(text):
            inputs = {"tokens": np.asarray([[0, *group, 0]], dtype=np.int64), "style": self.styles[sid, len(group)].reshape(1, -1), "speed": np.asarray([speed], dtype=np.float32)}
            audio = np.asarray(self.session.run(["audio"], inputs)[0], dtype=np.float32).reshape(-1)
            if not len(audio) or not np.isfinite(audio).all():
                raise RuntimeError("模型返回了无效音频")
            if samples:
                samples.append(np.zeros(int(self.sample_rate * 0.12), dtype=np.float32))
            samples.append(audio)
        if not samples:
            raise ValueError("没有可朗读的正文")
        return np.concatenate(samples)
