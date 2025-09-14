"""
Railway Hobby 플랜 최적화 Meta FAQ AI 챗봇 백엔드
- 메모리 사용량 최적화 (512MB 제한)
- CPU 효율성 향상
- 빠른 시작 시간 구현
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import asyncio
import aiohttp
from datetime import datetime
import logging
import uvicorn

# 메모리 효율적인 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# FastAPI 앱 생성 (최소한의 설정)
app = FastAPI(
    title="AdMate API",
    description="Railway + Ollama 최적화 버전",
    version="2.0.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT") == "development" else None
)

# CORS 설정 (최소한)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# 환경 변수 (Railway 최적화)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text:latest")
LLM_MODEL = os.getenv("LLM_MODEL", "llama3.2:1b")  # 경량 모델 사용
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# 요청/응답 모델 (간소화)
class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    sources: List[Dict[str, Any]] = []
    processing_time: float
    model: str

# 전역 HTTP 세션 (메모리 효율성)
http_session = None

async def get_http_session():
    """HTTP 세션 싱글톤 패턴"""
    global http_session
    if http_session is None:
        timeout = aiohttp.ClientTimeout(total=30)
        http_session = aiohttp.ClientSession(timeout=timeout)
    return http_session

@app.on_event("startup")
async def startup_event():
    """앱 시작 시 초기화"""
    logger.info("🚀 AdMate API 시작 중...")
    logger.info(f"📡 Ollama URL: {OLLAMA_BASE_URL}")
    logger.info(f"🤖 LLM Model: {LLM_MODEL}")
    logger.info(f"🔗 Embedding Model: {EMBEDDING_MODEL}")
    
    # HTTP 세션 미리 생성
    await get_http_session()
    logger.info("✅ 초기화 완료")

@app.on_event("shutdown")
async def shutdown_event():
    """앱 종료 시 정리"""
    global http_session
    if http_session:
        await http_session.close()
    logger.info("👋 AdMate API 종료")

@app.get("/")
async def root():
    """루트 엔드포인트"""
    return {
        "status": "healthy",
        "service": "AdMate API",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
async def health_check():
    """헬스 체크 (Railway 모니터링용)"""
    try:
        session = await get_http_session()
        async with session.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5) as response:
            ollama_status = "connected" if response.status == 200 else "disconnected"
    except Exception as e:
        logger.warning(f"Ollama 연결 확인 실패: {e}")
        ollama_status = "disconnected"
    
    return {
        "status": "healthy",
        "ollama": ollama_status,
        "timestamp": datetime.now().isoformat(),
        "memory_optimized": True
    }

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """최적화된 채팅 엔드포인트"""
    start_time = datetime.now()
    
    try:
        # 1. 임베딩 생성 (경량화)
        session = await get_http_session()
        
        async with session.post(
            f"{OLLAMA_BASE_URL}/api/embeddings",
            json={"model": EMBEDDING_MODEL, "prompt": request.message}
        ) as response:
            if response.status != 200:
                return await fallback_response(request.message, start_time)
            
            embedding_data = await response.json()
            query_embedding = embedding_data.get("embedding", [])
        
        # 2. 유사 문서 검색 (Supabase)
        sources = []
        context = ""
        
        if SUPABASE_URL and SUPABASE_KEY and query_embedding:
            sources = await search_documents(query_embedding)
            context = "\n".join([s.get("content", "")[:500] for s in sources[:3]])
        
        # 3. LLM 응답 생성
        response_text = await generate_llm_response(request.message, context, session)
        
        # 4. 응답 시간 계산
        processing_time = (datetime.now() - start_time).total_seconds()
        
        return ChatResponse(
            response=response_text,
            sources=sources,
            processing_time=processing_time,
            model=LLM_MODEL
        )
        
    except Exception as e:
        logger.error(f"채팅 처리 오류: {e}")
        return await fallback_response(request.message, start_time)

async def generate_llm_response(message: str, context: str, session: aiohttp.ClientSession) -> str:
    """LLM 응답 생성 (최적화)"""
    try:
        prompt = f"""다음 정보를 바탕으로 질문에 답해주세요.

정보: {context[:1000]}

질문: {message}

답변:"""
        
        async with session.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 300  # 응답 길이 제한
                }
            }
        ) as response:
            if response.status == 200:
                data = await response.json()
                return data.get("response", "응답 생성에 실패했습니다.")
            else:
                return "현재 서비스에 일시적인 문제가 있습니다."
                
    except Exception as e:
        logger.error(f"LLM 응답 생성 오류: {e}")
        return "죄송합니다. 현재 서비스를 이용할 수 없습니다."

async def search_documents(query_embedding: List[float]) -> List[Dict[str, Any]]:
    """문서 검색 (최적화)"""
    try:
        session = await get_http_session()
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }
        
        async with session.post(
            f"{SUPABASE_URL}/rest/v1/rpc/search_similar_chunks",
            headers=headers,
            json={
                "query_embedding": query_embedding,
                "match_threshold": 0.7,
                "match_count": 3  # 결과 수 제한
            }
        ) as response:
            if response.status == 200:
                return await response.json()
            return []
            
    except Exception as e:
        logger.error(f"문서 검색 오류: {e}")
        return []

async def fallback_response(message: str, start_time: datetime) -> ChatResponse:
    """백업 응답 (규칙 기반)"""
    # 간단한 키워드 매칭
    message_lower = message.lower()
    
    if any(keyword in message_lower for keyword in ["광고", "메타", "페이스북", "인스타그램"]):
        response = """Meta 광고에 대한 기본 안내입니다.

🎯 **주요 기능:**
- Facebook, Instagram, Threads 플랫폼 광고
- 정밀한 타겟팅 옵션
- 다양한 광고 형식 지원

📋 **기본 절차:**
1. 광고 계정 설정
2. 캠페인 목표 선택
3. 타겟 오디언스 설정
4. 예산 및 일정 설정
5. 크리에이티브 업로드
6. 검토 및 게시

더 구체적인 질문을 해주시면 더 정확한 답변을 드릴 수 있습니다."""
    else:
        response = f""""{message}"에 대한 질문을 주셨습니다.

현재 시스템이 일시적으로 제한된 기능으로 운영 중입니다.
더 구체적인 Meta 광고 관련 질문을 해주시면 도움을 드릴 수 있습니다.

예시 질문:
- Meta 광고 정책은 어떻게 되나요?
- 광고 예산은 어떻게 설정하나요?
- 타겟팅 옵션에는 무엇이 있나요?"""
    
    processing_time = (datetime.now() - start_time).total_seconds()
    
    return ChatResponse(
        response=response,
        sources=[],
        processing_time=processing_time,
        model="fallback"
    )

@app.get("/api/models")
async def get_models():
    """사용 가능한 모델 조회"""
    try:
        session = await get_http_session()
        async with session.get(f"{OLLAMA_BASE_URL}/api/tags") as response:
            if response.status == 200:
                data = await response.json()
                return {"models": data.get("models", [])}
            return {"models": []}
    except Exception as e:
        logger.error(f"모델 조회 오류: {e}")
        return {"models": []}

@app.post("/api/setup")
async def setup_models():
    """필수 모델 설치"""
    models = [EMBEDDING_MODEL, LLM_MODEL]
    results = []
    
    session = await get_http_session()
    
    for model in models:
        try:
            logger.info(f"🔄 모델 다운로드 중: {model}")
            async with session.post(
                f"{OLLAMA_BASE_URL}/api/pull",
                json={"name": model},
                timeout=aiohttp.ClientTimeout(total=600)
            ) as response:
                if response.status == 200:
                    results.append({"model": model, "status": "success"})
                    logger.info(f"✅ 모델 다운로드 완료: {model}")
                else:
                    error = await response.text()
                    results.append({"model": model, "status": "error", "message": error})
                    logger.error(f"❌ 모델 다운로드 실패: {model}")
        except Exception as e:
            results.append({"model": model, "status": "error", "message": str(e)})
            logger.error(f"❌ 모델 다운로드 예외: {model} - {e}")
    
    return {"results": results}

def get_port():
    """Railway PORT 환경변수 처리"""
    port_env = os.getenv('PORT', '5050')
    
    if port_env == '$PORT' or not port_env.isdigit():
        return 5050
    
    try:
        return int(port_env)
    except (ValueError, TypeError):
        return 5050

if __name__ == "__main__":
    port = get_port()
    
    logger.info(f"🚀 AdMate API 서버 시작")
    logger.info(f"📡 호스트: 0.0.0.0:{port}")
    logger.info(f"🤖 Ollama: {OLLAMA_BASE_URL}")
    
    uvicorn.run(
        "railway-optimized:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True
    )
