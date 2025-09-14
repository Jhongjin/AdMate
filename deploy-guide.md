# Railway 배포 가이드

## 🚀 Railway Hobby 플랜 최적화 배포

### 1단계: Ollama 서비스 배포

1. **새 Railway 프로젝트 생성**
   ```bash
   # Railway CLI 로그인
   railway login
   
   # 새 프로젝트 생성
   railway new
   ```

2. **Ollama 서비스 배포**
   ```bash
   cd railway-backend/ollama
   railway up
   ```

3. **Ollama 환경 변수 설정**
   - Railway 대시보드에서 다음 설정:
   ```
   OLLAMA_HOST=0.0.0.0
   OLLAMA_PORT=11434
   ```

### 2단계: 백엔드 API 서비스 배포

1. **백엔드 서비스 생성**
   ```bash
   cd railway-backend
   railway service create backend
   railway up
   ```

2. **환경 변수 설정**
   Railway 대시보드에서 설정:
   ```
   OLLAMA_BASE_URL=http://ollama:11434
   EMBEDDING_MODEL=nomic-embed-text:latest
   LLM_MODEL=llama3.2:1b
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   ENVIRONMENT=production
   PORT=5050
   ```

### 3단계: 네트워킹 설정

1. **서비스 간 통신 활성화**
   - Railway 대시보드에서 Private Networking 활성화
   - Ollama 서비스와 백엔드 서비스 연결

2. **도메인 설정**
   - 백엔드 서비스에 공개 도메인 할당
   - HTTPS 자동 설정 확인

### 4단계: 모델 설치 및 테스트

1. **모델 자동 설치**
   ```bash
   curl -X POST https://your-backend-url.railway.app/api/setup
   ```

2. **헬스 체크**
   ```bash
   curl https://your-backend-url.railway.app/health
   ```

3. **채팅 테스트**
   ```bash
   curl -X POST https://your-backend-url.railway.app/api/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "Meta 광고 정책에 대해 알려주세요"}'
   ```

## 📊 모니터링 및 최적화

### 리소스 모니터링
- Railway 대시보드에서 메모리/CPU 사용량 확인
- 512MB 메모리 제한 준수 확인

### 성능 최적화 팁
1. **모델 선택**: 경량 모델 사용 (llama3.2:1b)
2. **응답 길이 제한**: 300 토큰 이하
3. **동시 요청 제한**: 메모리 오버플로우 방지
4. **캐싱 활용**: HTTP 세션 재사용

### 문제 해결
- **502 오류**: Ollama 서비스 재시작 필요
- **메모리 초과**: 모델 크기 재검토
- **느린 응답**: 네트워크 설정 확인

## 🔧 유지보수

### 정기 작업
1. **모델 업데이트**
2. **로그 모니터링**
3. **성능 메트릭 확인**
4. **보안 패치 적용**

### 백업 계획
- 환경 변수 백업
- 설정 파일 버전 관리
- 배포 스크립트 유지

---

**주의사항**: Railway Hobby 플랜은 512MB RAM 제한이 있으므로 리소스 사용량을 지속적으로 모니터링해야 합니다.
