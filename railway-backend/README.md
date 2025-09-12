# Railway + Ollama 기반 Meta FAQ AI 챗봇 백엔드

이 디렉토리는 Railway 플랫폼과 Ollama LLM을 사용하는 백엔드 서비스입니다.

## 🚀 주요 기능

- **FastAPI 기반 REST API**: 고성능 비동기 API 서버
- **Ollama LLM 통합**: 로컬 LLM 모델 사용 (llama3.2:3b)
- **RAG 시스템**: 문서 임베딩 및 유사도 검색
- **Supabase 연동**: 벡터 데이터베이스 및 문서 저장
- **Docker 컨테이너화**: Railway 배포 최적화

## 🛠️ 기술 스택

- **FastAPI**: Python 웹 프레임워크
- **Ollama**: 로컬 LLM 실행 환경
- **Supabase**: 벡터 데이터베이스
- **Docker**: 컨테이너화
- **Railway**: 클라우드 배포 플랫폼

## 📦 설치 및 실행

### 로컬 개발 환경

1. **Ollama 설치 및 모델 다운로드**
```bash
# Ollama 설치 (https://ollama.ai)
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

2. **의존성 설치**
```bash
cd railway-backend
pip install -r requirements.txt
```

3. **환경 변수 설정**
```bash
cp env.example .env
# .env 파일을 편집하여 실제 값으로 설정
```

4. **서버 실행**
```bash
python app.py
```

### Railway 배포

1. **Railway 계정 생성 및 프로젝트 생성**
2. **GitHub 저장소 연결**
3. **환경 변수 설정**
4. **자동 배포 완료**

## 🔧 API 엔드포인트

- `GET /`: 서비스 상태 확인
- `GET /health`: 헬스 체크
- `POST /api/chat`: 채팅 메시지 처리
- `POST /api/upload`: 문서 업로드
- `GET /api/models`: 사용 가능한 모델 목록

## 📊 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `OLLAMA_BASE_URL` | Ollama 서버 URL | `http://localhost:11434` |
| `EMBEDDING_MODEL` | 임베딩 모델명 | `nomic-embed-text` |
| `LLM_MODEL` | LLM 모델명 | `llama3.2:3b` |
| `SUPABASE_URL` | Supabase 프로젝트 URL | - |
| `SUPABASE_KEY` | Supabase API 키 | - |
| `EMBEDDING_DIM` | 임베딩 차원 | `768` |
| `TOP_K` | 검색 결과 수 | `5` |

## 🐳 Docker 실행

```bash
# 이미지 빌드
docker build -t meta-faq-railway .

# 컨테이너 실행
docker run -p 8000:8000 \
  -e SUPABASE_URL=your_url \
  -e SUPABASE_KEY=your_key \
  meta-faq-railway
```

## 🔄 Vercel+Gemini 버전과의 차이점

| 구분 | Vercel+Gemini | Railway+Ollama |
|------|---------------|----------------|
| **프론트엔드** | Next.js (Vercel) | Next.js (Vercel) |
| **백엔드** | Vercel Functions | FastAPI (Railway) |
| **LLM** | Google Gemini | Ollama (로컬) |
| **데이터베이스** | Supabase | Supabase |
| **배포** | Vercel | Railway |
| **비용** | 사용량 기반 | 고정 비용 |
| **지연시간** | 낮음 | 중간 |
| **개인정보** | Google 서버 | 로컬 처리 |

## 📝 주의사항

1. **Ollama 모델 크기**: llama3.2:3b는 약 2GB의 디스크 공간이 필요합니다.
2. **메모리 요구사항**: 최소 4GB RAM 권장
3. **네트워크**: Ollama 서버와의 통신이 필요합니다.
4. **모델 업데이트**: 새로운 모델을 사용하려면 Ollama에서 모델을 다운로드해야 합니다.

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
