path = r'C:\Users\Admin\.qclaw\workspace-2dgx8snjc7h1av5j\blackhole-3d-xr\src\index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add version right after title
content = content.replace('<title>blackhole-3d-xr</title>', '<title>blackhole-3d-xr v8.1452</title>')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Patched HTML title')
with open(path, 'r', encoding='utf-8') as f:
    print(f.read()[:300])
