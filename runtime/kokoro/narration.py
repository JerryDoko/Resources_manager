"""Prepare a speech copy of book text; never edit the archived original."""
import re


def prepare(text: str) -> str:
    # Width conversion only: keep names, digits and other meaningful symbols.
    text = ''.join(chr(ord(c) - 0xFEE0) if 0xFF01 <= ord(c) <= 0xFF5E and c != '，'
                   else ' ' if c == '\u3000' else c for c in text)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]', '', text)
    chars = []
    for i, c in enumerate(text):
        if c in "'‘’":
            # Don't break English contractions/names such as It's or O’Connor.
            if (0 < i < len(text) - 1 and text[i-1].isascii()
                    and text[i+1].isascii() and text[i-1].isalnum()
                    and text[i+1].isalnum()):
                chars.append("'")
            else:
                chars.append('，')
        elif c in '"“”„‟〝〞«»「」『』':
            chars.append('，')
        elif c in '《》〈〉':
            continue
        elif c in '()[]{}【】〔〕〖〗':
            chars.append('，')
        elif c in ':：':
            chars.append(c if 0 < i < len(text)-1 and text[i-1].isdigit()
                         and text[i+1].isdigit() else '，')
        else:
            chars.append(c)
    text = ''.join(chars)
    text = re.sub(r'[…⋯]+|\.{3,}|[—–―]+|-{2,}', '，', text)
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[,，、](?:\s*[,，、])+', '，', text)
    text = re.sub(r'[,，、]\s*([。.!?！？;；])', r'\1', text)
    text = re.sub(r'([。.!?！？;；])\s*[,，、]', r'\1', text)
    text = text.strip(' ，,、')
    return text if any(c.isalpha() or c.isdecimal() for c in text) else ''
