#!/bin/bash

# Railway 최적화 시작 스크립트
echo "🚀 AdMate API 시작 중..."

# Ollama 서버 백그라운드 시작
echo "📡 Ollama 서버 시작..."
ollama serve &
OLLAMA_PID=$!

# Ollama 서버 대기 (최대 30초)
echo "⏳ Ollama 서버 대기 중..."
for i in {1..30}; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✅ Ollama 서버 준비 완료"
        break
    fi
    echo "대기 중... ($i/30)"
    sleep 1
done

# FastAPI 앱 시작
echo "🤖 FastAPI 앱 시작..."
python3 railway-optimized.py
