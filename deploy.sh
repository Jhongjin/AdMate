#!/bin/bash

# Railway + Ollama 자동 배포 스크립트
# Railway Hobby 플랜 최적화 버전

set -e

echo "🚀 AdMate Railway 배포 시작..."

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 함수 정의
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Railway CLI 확인
check_railway_cli() {
    print_status "Railway CLI 확인 중..."
    if ! command -v railway &> /dev/null; then
        print_error "Railway CLI가 설치되지 않았습니다."
        echo "설치 방법: https://docs.railway.app/develop/cli"
        exit 1
    fi
    print_success "Railway CLI 확인 완료"
}

# 로그인 확인
check_login() {
    print_status "Railway 로그인 상태 확인 중..."
    if ! railway whoami &> /dev/null; then
        print_warning "Railway에 로그인이 필요합니다."
        railway login
    fi
    print_success "Railway 로그인 확인 완료"
}

# 프로젝트 생성 또는 연결
setup_project() {
    print_status "Railway 프로젝트 설정 중..."
    
    # 기존 프로젝트가 있는지 확인
    if [ ! -f ".railway/project.json" ]; then
        print_status "새 Railway 프로젝트 생성 중..."
        railway new "admate-faq-chatbot"
    else
        print_status "기존 Railway 프로젝트 연결됨"
    fi
    
    print_success "Railway 프로젝트 설정 완료"
}

# Ollama 서비스 배포
deploy_ollama() {
    print_status "Ollama 서비스 배포 중..."
    
    cd ollama
    
    # Ollama 서비스 생성
    railway service create ollama --dockerfile Dockerfile
    
    # 환경 변수 설정
    railway variables set OLLAMA_HOST=0.0.0.0
    railway variables set OLLAMA_PORT=11434
    railway variables set OLLAMA_MODELS=/usr/share/ollama/.ollama/models
    
    # 배포
    railway up --service ollama
    
    cd ..
    print_success "Ollama 서비스 배포 완료"
}

# 백엔드 서비스 배포
deploy_backend() {
    print_status "백엔드 API 서비스 배포 중..."
    
    # 백엔드 서비스 생성
    railway service create backend --dockerfile Dockerfile.optimized
    
    # 환경 변수 설정
    print_status "환경 변수 설정 중..."
    railway variables set OLLAMA_BASE_URL=http://ollama:11434 --service backend
    railway variables set EMBEDDING_MODEL=nomic-embed-text:latest --service backend
    railway variables set LLM_MODEL=llama3.2:1b --service backend
    railway variables set ENVIRONMENT=production --service backend
    railway variables set PORT=5050 --service backend
    
    # Supabase 환경 변수 (사용자 입력 필요)
    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
        print_warning "Supabase 환경 변수가 설정되지 않았습니다."
        print_warning "Railway 대시보드에서 수동으로 설정해주세요:"
        echo "  - SUPABASE_URL"
        echo "  - SUPABASE_KEY"
    else
        railway variables set SUPABASE_URL=$SUPABASE_URL --service backend
        railway variables set SUPABASE_KEY=$SUPABASE_KEY --service backend
    fi
    
    # 배포
    railway up --service backend
    
    print_success "백엔드 서비스 배포 완료"
}

# 배포 후 검증
verify_deployment() {
    print_status "배포 검증 중..."
    
    # 서비스 URL 가져오기
    BACKEND_URL=$(railway domain --service backend)
    
    if [ -z "$BACKEND_URL" ]; then
        print_warning "백엔드 도메인을 자동으로 가져올 수 없습니다."
        print_warning "Railway 대시보드에서 확인해주세요."
        return
    fi
    
    print_status "헬스 체크 수행 중..."
    
    # 헬스 체크 (최대 5번 재시도)
    for i in {1..5}; do
        print_status "헬스 체크 시도 $i/5..."
        
        if curl -f -s "https://$BACKEND_URL/health" > /dev/null; then
            print_success "헬스 체크 성공!"
            
            # 모델 설치
            print_status "필수 모델 설치 중..."
            curl -X POST "https://$BACKEND_URL/api/setup" \
                -H "Content-Type: application/json" \
                --max-time 600 || print_warning "모델 설치에 시간이 걸릴 수 있습니다."
            
            break
        else
            if [ $i -eq 5 ]; then
                print_error "헬스 체크 실패. 배포를 확인해주세요."
                return 1
            fi
            print_warning "헬스 체크 실패. 30초 후 재시도..."
            sleep 30
        fi
    done
    
    print_success "배포 검증 완료!"
    echo ""
    echo "🎉 AdMate API가 성공적으로 배포되었습니다!"
    echo "🔗 API URL: https://$BACKEND_URL"
    echo "📖 API 문서: https://$BACKEND_URL/docs"
    echo "💚 헬스 체크: https://$BACKEND_URL/health"
}

# 메인 실행 함수
main() {
    echo "=========================================="
    echo "🤖 AdMate Railway 배포 스크립트"
    echo "Railway Hobby 플랜 최적화 버전"
    echo "=========================================="
    echo ""
    
    check_railway_cli
    check_login
    setup_project
    
    echo ""
    print_status "배포 옵션을 선택하세요:"
    echo "1) 전체 배포 (Ollama + 백엔드)"
    echo "2) Ollama만 배포"
    echo "3) 백엔드만 배포"
    echo "4) 검증만 수행"
    
    read -p "선택 (1-4): " choice
    
    case $choice in
        1)
            deploy_ollama
            sleep 60  # Ollama 서비스 시작 대기
            deploy_backend
            sleep 30  # 백엔드 서비스 시작 대기
            verify_deployment
            ;;
        2)
            deploy_ollama
            ;;
        3)
            deploy_backend
            sleep 30
            verify_deployment
            ;;
        4)
            verify_deployment
            ;;
        *)
            print_error "잘못된 선택입니다."
            exit 1
            ;;
    esac
    
    echo ""
    print_success "배포 스크립트 실행 완료!"
}

# 스크립트 실행
main "$@"
