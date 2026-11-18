#!/usr/bin/env python3
"""Inventory potential UI literals in HTML, JavaScript and Python source.

This is a discovery tool, not a destructive rewriter. It does not rewrite
project data, MIME/types, CSS selectors or programmatic enum values.
"""
from __future__ import annotations
import ast
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / 'static'
PACK = json.loads((STATIC/'locales'/'ko.json').read_text())
EN = json.loads((STATIC/'locales'/'en.json').read_text())
KOREAN = re.compile('[가-힣]')
QUOTED = re.compile(r'''(?P<q>['"`])(?P<body>(?:\\.|(?!\1).)*?)(?P=q)''', re.S)

class HTMLText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items=[];self.skip=0;self.line=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','svg'):self.skip+=1
        if self.skip:return
        for key,val in attrs:
            if key in ('title','placeholder','aria-label','aria-description','alt') and val:
                self.items.append((self.getpos()[0],f'attribute:{key}',val.strip()))
    def handle_endtag(self,tag):
        if tag in ('script','style','svg'):self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip and data.strip():self.items.append((self.getpos()[0],'text',data.strip()))

items=[]
seen=set()
def record(file,line,kind,text):
    text=str(text).strip()
    if len(text)<2 or len(text)>350 or '\x00' in text:return
    # Dynamic template strings can contain markup or interpolation; inventory
    # those containing Hangul but don't try translating their structure.
    human=bool(KOREAN.search(text))
    if not human:return
    covered=text in PACK['legacy'] or text in PACK['messages'].values()
    key=(str(file.relative_to(ROOT)),line,kind,text)
    if key in seen:return
    seen.add(key);items.append({'file':key[0],'line':line,'kind':kind,'text':text,'covered':covered})

for file in [STATIC/'index.html',STATIC/'render.html']:
    parser=HTMLText();parser.feed(file.read_text(encoding='utf-8'))
    for line,kind,text in parser.items:record(file,line,kind,text)
for file in sorted(STATIC.rglob('*.js')):
    if any(s in file.parts for s in ('vendor','node_modules')) or file.name.endswith('.min.js'):continue
    src=file.read_text(encoding='utf-8',errors='replace')
    for m in QUOTED.finditer(src):
        text=m.group('body');line=src.count('\n',0,m.start())+1
        if KOREAN.search(text):record(file,line,'js-literal',text)
for file in sorted(ROOT.glob('*.py')):
    try:tree=ast.parse(file.read_text(encoding='utf-8'))
    except Exception:continue
    for node in ast.walk(tree):
        if isinstance(node,(ast.Constant,ast.JoinedStr)):
            text=node.value if isinstance(node,ast.Constant) else ''.join(x.value for x in node.values if isinstance(x,ast.Constant) and isinstance(x.value,str))
            if isinstance(text,str):record(file,getattr(node,'lineno',1),'python-literal',text)

out=ROOT/'docs'/'I18N_LITERAL_AUDIT_v22.json'
summary={'total_candidates':len(items),'previously_catalogued':sum(x['covered'] for x in items),
    'needs_manual_extraction':sum(not x['covered'] for x in items),
    'scope':'Potential Korean UI string literals; false positives include error diagnostics and templates'}
out.write_text(json.dumps({'summary':summary,'items':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
