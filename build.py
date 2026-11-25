import json,base64
s=open('src/server.js').read()
def emb(path): return json.dumps(open(path).read())
s=s.replace('__APP_HTML__',emb('src/app.html')).replace('__SW_JS__',emb('src/sw.js'))
for n in ('180','512'):
    s=s.replace(f'__ICON_{n}__',json.dumps(base64.b64encode(open(f'assets/icon-{n}.png','rb').read()).decode()))
s=s.replace('__SEED__',json.dumps(json.load(open('seed.json')),ensure_ascii=False))
open('build/worker.js','w').write(s)
print(len(s))
