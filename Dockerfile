# Railway + Ollama 기반 Meta FAQ AI 챗봇 백엔드
FROM python:3.12-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 패키지 업데이트 및 필요한 패키지 설치
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt 복사 및 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 포트 노출 (Railway 권장 5000+)
EXPOSE 5050

# 환경 변수 설정
ENV PORT=5050
ENV PYTHONPATH=/app

# 애플리케이션 실행 (Python 직접 실행으로 PORT 파싱 문제 회피)
CMD ["python", "app.py"]