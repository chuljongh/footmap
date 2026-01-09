with open('styles.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()
# Line 446 (0-indexed 445)
lines[445] = '    z-index: 2200;\n'
# Line 1838 (0-indexed 1837)
lines[1837] = '    z-index: 2100;\n'
with open('styles.css', 'w', encoding='utf-8', newline='\n') as f:
    f.writelines(lines)
print("Updated successfully")
