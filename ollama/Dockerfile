# Railway Hobby 플랜용 Ollama 최적화 버전
FROM ollama/ollama:latest

# Railway 환경 변수 설정
ENV OLLAMA_HOST=0.0.0.0
ENV OLLAMA_PORT=11434
ENV OLLAMA_MODELS=/usr/share/ollama/.ollama/models

# 필요한 디렉토리 생성
RUN mkdir -p /usr/share/ollama/.ollama/models

# 포트 노출
EXPOSE 11434

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:11434/api/tags || exit 1

# Ollama 서버 시작
CMD ["/bin/ollama", "serve"]
