# 커밋 가이드라인

## 커밋 메시지 패턴

모든 커밋은 다음 패턴을 따라야 합니다:

```
final_v1_YYYY_MM_DD_HH: [Brief description of changes]
```

### 예시:
- `final_v1_2025_09_22_09: Complete Meta FAQ RAG chatbot system`
- `final_v1_2025_09_22_10: Fix document upload validation`
- `final_v1_2025_09_22_11: Add user authentication system`

## 커밋 메시지 구조

```markdown
# final_v1_YYYY_MM_DD_HH: [Brief description of changes]

## Summary
[One-line summary of what was changed]

## Changes Made
- [ ] [Specific change 1]
- [ ] [Specific change 2]
- [ ] [Specific change 3]

## Features Added/Modified
- [Feature 1]: [Description]
- [Feature 2]: [Description]

## Technical Details
- [Technical detail 1]
- [Technical detail 2]

## Testing
- [ ] [Test case 1]
- [ ] [Test case 2]

## Notes
[Any additional notes or considerations]
```

## 브랜치 생성 규칙

새로운 기능이나 수정사항이 있을 때는 다음 패턴으로 브랜치를 생성합니다:

```bash
git checkout -b final_v1_YYYY_MM_DD_HH
```

## 커밋 전 체크리스트

- [ ] 모든 변경사항이 스테이징되었는지 확인
- [ ] 커밋 메시지가 올바른 패턴을 따르는지 확인
- [ ] 불필요한 파일이 포함되지 않았는지 확인
- [ ] 테스트가 통과하는지 확인

## 자동화 스크립트

커밋을 쉽게 하기 위해 다음 스크립트를 사용할 수 있습니다:

```bash
# Windows PowerShell
$timestamp = Get-Date -Format "yyyy_MM_dd_HH"
git add .
git commit -m "final_v1_$timestamp: [Your description here]"
git push origin final_v1_$timestamp
```

## 주의사항

1. **항상 final_v1_ 접두사 사용**: 모든 커밋과 브랜치에 이 접두사를 사용합니다.
2. **타임스탬프 정확성**: YYYY_MM_DD_HH 형식을 정확히 사용합니다.
3. **명확한 설명**: 커밋 메시지에 변경사항을 명확히 설명합니다.
4. **일관성 유지**: 모든 커밋에서 동일한 패턴을 유지합니다.
