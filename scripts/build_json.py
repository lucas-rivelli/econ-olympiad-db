#!/usr/bin/env python3
"""
build_json.py
Parses all question .tex files and generates docs/questions.json
Run from the Database/ root: python3 scripts/build_json.py
"""

import os, re, json

def extract_brace_content(text, start):
    """Extract content between matching braces; 'start' must point to '{'."""
    if start >= len(text) or text[start] != '{':
        return '', start
    depth = 0
    i = start
    content_start = start + 1
    while i < len(text):
        if text[i] == '\\':
            i += 2
            continue
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return text[content_start:i], i + 1
        i += 1
    return text[content_start:], len(text)

def parse_question_block(block):
    result = {}
    i = 0
    n = len(block)
    while i < n:
        while i < n and block[i] in ' \t\n\r,':
            i += 1
        if i >= n:
            break
        if block[i] == '%':
            while i < n and block[i] != '\n':
                i += 1
            continue
        m = re.match(r'([a-zA-Z_]+)\s*=\s*', block[i:])
        if not m:
            i += 1
            continue
        key = m.group(1).strip()
        i += m.end()
        if i < n and block[i] == '{':
            value, i = extract_brace_content(block, i)
            value = value.strip()
            if value.startswith('%'):
                nl = value.find('\n')
                value = value[nl+1:].strip() if nl >= 0 else ''
            result[key] = value
        else:
            i += 1
    return result

def parse_choices(raw):
    """Split \item content into a list of choice strings."""
    if not raw:
        return []
    parts = re.split(r'\\item\s*', raw)
    choices = [p.strip().rstrip(',').strip() for p in parts if p.strip()]
    return choices

def parse_tex_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    m = re.search(r'\\question\s*\{', content)
    if not m:
        return None
    block_start = m.end() - 1
    block, _ = extract_brace_content(content, block_start)
    data = parse_question_block(block)
    if not data.get('id'):
        return None
    # Post-process choices into a list
    data['choices'] = parse_choices(data.get('choices', ''))
    return data

def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    questions_dir = os.path.join(base, 'questions')
    docs_dir = os.path.join(base, 'docs')
    os.makedirs(docs_dir, exist_ok=True)

    questions = []
    for topic in sorted(os.listdir(questions_dir)):
        topic_dir = os.path.join(questions_dir, topic)
        if not os.path.isdir(topic_dir):
            continue
        for fname in sorted(os.listdir(topic_dir)):
            if not fname.endswith('.tex'):
                continue
            fpath = os.path.join(topic_dir, fname)
            data = parse_tex_file(fpath)
            if not data:
                continue
            data['file'] = f'questions/{topic}/{fname}'
            questions.append(data)

    questions.sort(key=lambda q: q.get('id', '9999'))

    out = os.path.join(docs_dir, 'questions.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    print(f"Generated {out} with {len(questions)} questions.")

if __name__ == '__main__':
    main()
