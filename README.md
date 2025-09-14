# AdMate Railway Backend

Railway Hobby 플랜 최적화 Meta FAQ AI 챗봇 백엔드

## 🚀 특징

- **초경량 모델**: TinyLlama (637MB, <4GB RAM)
- **Docker 기반**: 공식 Ollama 이미지 사용
- **모델 사전 로딩**: 콜드 스타트 최소화
- **메모리 최적화**: 8GB 한계 내 안전한 운영

## 📦 배포

Railway에서 이 리포지토리를 연결하여 자동 배포됩니다.

### 환경 변수 설정

```
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
LLM_MODEL=tinyllama
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## 🔧 로컬 개발

```bash
# Docker 빌드
docker build -f Dockerfile.minimal -t admate-backend .

# 실행
docker run -p 5050:5050 admate-backend
```

## 📊 예상 비용 (Railway Hobby)

- **메모리**: ~4GB = ~$20/월
- **CPU**: 최소 사용량
- **총 예상**: ~$25/월
