import re

with open('styles.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Redefine z-index hierarchy
# .top-bar-wrapper: 2200 -> 1100
content = content.replace('z-index: 2200;', 'z-index: 1100;')
# .bottom-bar: 2100 -> 1100
content = content.replace('z-index: 2100;', 'z-index: 1100;')

# .modal: 2000 -> 3000
# There are two .modal definitions and one #write-modal block
content = content.replace('z-index: 2000;', 'z-index: 3000;')

# .thread-panel: 2000 -> 2500 (Panels should be between bars and modals)
# Wait, if I replaced 2000 -> 3000 already, I need to be careful.
# Let's use regex for more precision.

def fix_z_indices(text):
    # Bars & Navigation (Base UI) -> 1100-1200
    text = re.sub(r'\.top-bar-wrapper\s*\{([^}]*?)z-index:\s*\d+;', r'.top-bar-wrapper {\1z-index: 1100;', text, flags=re.DOTALL)
    text = re.sub(r'\.bottom-bar\s*\{([^}]*?)z-index:\s*\d+;', r'.bottom-bar {\1z-index: 1100;', text, flags=re.DOTALL)
    text = re.sub(r'\.navigation-hud\s*\{([^}]*?)z-index:\s*\d+;', r'.navigation-hud {\1z-index: 1200;', text, flags=re.DOTALL)

    # Panels (Thread View) -> 2000
    text = re.sub(r'\.thread-panel\s*\{([^}]*?)z-index:\s*\d+;', r'.thread-panel {\1z-index: 2000;', text, flags=re.DOTALL)

    # Modals (Write, Settings) -> 3000
    # Note: .modal is defined twice in styles.css
    text = re.sub(r'\.modal\s*\{([^}]*?)z-index:\s*\d+;', r'.modal {\1z-index: 3000;', text, flags=re.DOTALL)

    # Toasts -> 5000
    text = re.sub(r'\.toast-message\s*\{([^}]*?)z-index:\s*\d+;', r'.toast-message {\1z-index: 5000;', text, flags=re.DOTALL)

    return text

new_content = fix_z_indices(content)

with open('styles.css', 'w', encoding='utf-8', newline='\n') as f:
    f.write(new_content)

print("UI Layering (Z-Index) fixed successfully")
