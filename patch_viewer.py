# Patch viewer/index.tsx: replace VERSION approach with static hardcoded version
# Approach: hardcode a visible version string in the component that always shows

import sys
import re

path = r'C:\Users\Admin\.qclaw\workspace-2dgx8snjc7h1av5j\blackhole-3d-xr\src\pages\viewer\index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace declare const VERSION with static string
content = content.replace('declare const VERSION: string', "const APP_VERSION = 'v8.1452'")

# 2. Replace all VERSION references with APP_VERSION
content = content.replace('VERSION', 'APP_VERSION')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Patched successfully')

# Verify
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines[0:3], 1):
    print(f'{i}: {repr(line[:80])}')
for i, line in enumerate(lines[11:17], 12):
    print(f'{i}: {repr(line[:80])}')