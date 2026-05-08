path = r'C:\Users\Admin\.qclaw\workspace-2dgx8snjc7h1av5j\blackhole-3d-xr\src\pages\viewer\index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 13 (0-indexed: 12) - replace the broken line
lines[12] = "const BUILD_VERSION = (window as any).__BUILD_VERSION__ || 'dev'\n"

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Fixed line 13')
# Verify
with open(path, 'r', encoding='utf-8') as f:
    lines2 = f.readlines()
for i, line in enumerate(lines2[11:16], 12):
    print(f'{i}: {repr(line[:80])}')

# Also fix the comment on line 12
# The comment should stay but be clean
lines2[11] = "// 从 index.html 注入的 window.__BUILD_VERSION__ 读取版本号\n"

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines2)

print('Fixed comment too')
with open(path, 'r', encoding='utf-8') as f:
    lines3 = f.readlines()
for i, line in enumerate(lines3[11:16], 12):
    print(f'{i}: {repr(line[:80])}')