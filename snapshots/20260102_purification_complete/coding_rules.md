# 3 Golden Coding Rules

1. **No Inline Styles (JS ≠ CSS)**
   - **Rule**: Never set styles via JS (`el.style.width = ...`).
   - **Action**: Use JS to toggle classes; define proper styles in CSS.

2. **No `!important`**
   - **Rule**: Do not force styles.
   - **Action**: Fix specificities or HTML structure instead of overriding.

3. **Delete Dead Code**
   - **Rule**: Don't comment out; delete.
   - **Action**: Remove unused classes/logic immediately to avoid "ghost" rendering.

4. **코드 작업할 때는 `code_work.md`의 규칙을 반드시 준수한다.**
