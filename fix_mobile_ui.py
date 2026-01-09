with open('styles.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 225: .splash-logo-wrapper width 100vw -> 100% to keep it in container
lines[224] = '    width: 100%;\n'

# Line 438: top-bar-wrapper top adjustment logic for safe areas
# top: 16px -> calc(16px + env(safe-area-inset-top, 0))
lines[437] = '    top: calc(16px + env(safe-area-inset-top, 0px));\n'

# Line 1834: bottom-bar bottom adjustment logic for safe areas
# bottom: 0 -> env(safe-area-inset-bottom, 0)
lines[1833] = '    bottom: env(safe-area-inset-bottom, 0px);\n'

# Add mobile optimization at the end
lines.append('\n/* Mobile Scaling Optimization */\n')
lines.append('@media (max-width: 480px) {\n')
lines.append('    .splash-logo-wrapper { max-width: 280px !important; }\n')
lines.append('    .app-title { font-size: 28px !important; }\n')
lines.append('    .top-bar { height: 44px !important; gap: 4px !important; }\n')
lines.append('    #search-input { font-size: 14px !important; }\n')
lines.append('    .bottom-bar { padding: 12px 16px env(safe-area-inset-bottom, 12px) !important; }\n')
lines.append('    .icon-btn.action-btn { width: 44px !important; height: 44px !important; font-size: 20px !important; }\n')
lines.append('    .navigate-btn { height: 44px !important; font-size: 14px !important; }\n')
lines.append('}\n')

with open('styles.css', 'w', encoding='utf-8', newline='\n') as f:
    f.writelines(lines)
print("Mobile layout optimization applied successfully")
