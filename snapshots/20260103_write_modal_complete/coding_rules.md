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

4. **코드 작업 원칙 준수**
   - **Rule**: 모든 코드 작업 시 `code_work.md`의 도구 사용 규칙을 반드시 준수한다.

5. **No Autonomous Modification (독단적 수정 금지)**
   - **Rule**: 사용자의 명시적 승인 없이는 단 한 줄의 코드도 수정하지 않는다.
   - **Action**: 반드시 계획을 먼저 제시하고, 사용자가 승인한 후에만 도구를 사용한다.
