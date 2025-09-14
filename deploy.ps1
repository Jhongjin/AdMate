# Railway + Ollama 자동 배포 스크립트 (PowerShell)
# Railway Hobby 플랜 최적화 버전

param(
    [string]$SupabaseUrl = "",
    [string]$SupabaseKey = "",
    [int]$Choice = 0
)

# 색상 정의
$Colors = @{
    Red = "Red"
    Green = "Green" 
    Yellow = "Yellow"
    Blue = "Blue"
    White = "White"
}

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Colors.Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Colors.Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Colors.Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Colors.Red
}

# Railway CLI 확인
function Test-RailwayCLI {
    Write-Status "Railway CLI 확인 중..."
    
    try {
        $null = railway --version
        Write-Success "Railway CLI 확인 완료"
        return $true
    }
    catch {
        Write-Error "Railway CLI가 설치되지 않았습니다."
        Write-Host "설치 방법: https://docs.railway.app/develop/cli"
        return $false
    }
}

# 로그인 확인
function Test-RailwayLogin {
    Write-Status "Railway 로그인 상태 확인 중..."
    
    try {
        $null = railway whoami 2>$null
        Write-Success "Railway 로그인 확인 완료"
        return $true
    }
    catch {
        Write-Warning "Railway에 로그인이 필요합니다."
        railway login
        return $true
    }
}

# 프로젝트 설정
function Initialize-Project {
    Write-Status "Railway 프로젝트 설정 중..."
    
    if (-not (Test-Path ".railway/project.json")) {
        Write-Status "새 Railway 프로젝트 생성 중..."
        railway new "admate-faq-chatbot"
    }
    else {
        Write-Status "기존 Railway 프로젝트 연결됨"
    }
    
    Write-Success "Railway 프로젝트 설정 완료"
}

# Ollama 서비스 배포
function Deploy-Ollama {
    Write-Status "Ollama 서비스 배포 중..."
    
    Push-Location "ollama"
    
    try {
        # Ollama 서비스 생성
        railway service create ollama --dockerfile Dockerfile
        
        # 환경 변수 설정
        railway variables set OLLAMA_HOST=0.0.0.0
        railway variables set OLLAMA_PORT=11434
        railway variables set OLLAMA_MODELS=/usr/share/ollama/.ollama/models
        
        # 배포
        railway up --service ollama
        
        Write-Success "Ollama 서비스 배포 완료"
    }
    catch {
        Write-Error "Ollama 서비스 배포 실패: $_"
        throw
    }
    finally {
        Pop-Location
    }
}

# 백엔드 서비스 배포
function Deploy-Backend {
    param(
        [string]$SupabaseUrl,
        [string]$SupabaseKey
    )
    
    Write-Status "백엔드 API 서비스 배포 중..."
    
    try {
        # 백엔드 서비스 생성
        railway service create backend --dockerfile Dockerfile.optimized
        
        # 환경 변수 설정
        Write-Status "환경 변수 설정 중..."
        railway variables set OLLAMA_BASE_URL=http://ollama:11434 --service backend
        railway variables set EMBEDDING_MODEL=nomic-embed-text:latest --service backend
        railway variables set LLM_MODEL=llama3.2:1b --service backend
        railway variables set ENVIRONMENT=production --service backend
        railway variables set PORT=5050 --service backend
        
        # Supabase 환경 변수
        if ($SupabaseUrl -and $SupabaseKey) {
            railway variables set SUPABASE_URL=$SupabaseUrl --service backend
            railway variables set SUPABASE_KEY=$SupabaseKey --service backend
            Write-Success "Supabase 환경 변수 설정 완료"
        }
        else {
            Write-Warning "Supabase 환경 변수가 설정되지 않았습니다."
            Write-Warning "Railway 대시보드에서 수동으로 설정해주세요:"
            Write-Host "  - SUPABASE_URL"
            Write-Host "  - SUPABASE_KEY"
        }
        
        # 배포
        railway up --service backend
        
        Write-Success "백엔드 서비스 배포 완료"
    }
    catch {
        Write-Error "백엔드 서비스 배포 실패: $_"
        throw
    }
}

# 배포 검증
function Test-Deployment {
    Write-Status "배포 검증 중..."
    
    try {
        # 서비스 URL 가져오기
        $backendUrl = railway domain --service backend
        
        if (-not $backendUrl) {
            Write-Warning "백엔드 도메인을 자동으로 가져올 수 없습니다."
            Write-Warning "Railway 대시보드에서 확인해주세요."
            return
        }
        
        Write-Status "헬스 체크 수행 중..."
        
        # 헬스 체크 (최대 5번 재시도)
        $healthCheckSuccess = $false
        
        for ($i = 1; $i -le 5; $i++) {
            Write-Status "헬스 체크 시도 $i/5..."
            
            try {
                $response = Invoke-WebRequest -Uri "https://$backendUrl/health" -Method GET -TimeoutSec 30
                if ($response.StatusCode -eq 200) {
                    Write-Success "헬스 체크 성공!"
                    $healthCheckSuccess = $true
                    break
                }
            }
            catch {
                if ($i -eq 5) {
                    Write-Error "헬스 체크 실패. 배포를 확인해주세요."
                    return $false
                }
                Write-Warning "헬스 체크 실패. 30초 후 재시도..."
                Start-Sleep -Seconds 30
            }
        }
        
        if ($healthCheckSuccess) {
            # 모델 설치
            Write-Status "필수 모델 설치 중..."
            try {
                Invoke-WebRequest -Uri "https://$backendUrl/api/setup" -Method POST -TimeoutSec 600
                Write-Success "모델 설치 시작됨"
            }
            catch {
                Write-Warning "모델 설치에 시간이 걸릴 수 있습니다."
            }
            
            Write-Success "배포 검증 완료!"
            Write-Host ""
            Write-Host "🎉 AdMate API가 성공적으로 배포되었습니다!" -ForegroundColor $Colors.Green
            Write-Host "🔗 API URL: https://$backendUrl"
            Write-Host "📖 API 문서: https://$backendUrl/docs"
            Write-Host "💚 헬스 체크: https://$backendUrl/health"
            
            return $true
        }
        
        return $false
    }
    catch {
        Write-Error "배포 검증 실패: $_"
        return $false
    }
}

# 메인 실행 함수
function Main {
    Write-Host "==========================================" -ForegroundColor $Colors.Blue
    Write-Host "🤖 AdMate Railway 배포 스크립트" -ForegroundColor $Colors.Blue
    Write-Host "Railway Hobby 플랜 최적화 버전" -ForegroundColor $Colors.Blue
    Write-Host "==========================================" -ForegroundColor $Colors.Blue
    Write-Host ""
    
    # Railway CLI 확인
    if (-not (Test-RailwayCLI)) {
        exit 1
    }
    
    # 로그인 확인
    if (-not (Test-RailwayLogin)) {
        exit 1
    }
    
    # 프로젝트 설정
    Initialize-Project
    
    # 배포 옵션 선택
    if ($Choice -eq 0) {
        Write-Host ""
        Write-Status "배포 옵션을 선택하세요:"
        Write-Host "1) 전체 배포 (Ollama + 백엔드)"
        Write-Host "2) Ollama만 배포"
        Write-Host "3) 백엔드만 배포"
        Write-Host "4) 검증만 수행"
        
        do {
            $Choice = Read-Host "선택 (1-4)"
        } while ($Choice -notin @("1", "2", "3", "4"))
        
        $Choice = [int]$Choice
    }
    
    try {
        switch ($Choice) {
            1 {
                Deploy-Ollama
                Write-Status "Ollama 서비스 시작 대기 (60초)..."
                Start-Sleep -Seconds 60
                Deploy-Backend -SupabaseUrl $SupabaseUrl -SupabaseKey $SupabaseKey
                Write-Status "백엔드 서비스 시작 대기 (30초)..."
                Start-Sleep -Seconds 30
                Test-Deployment
            }
            2 {
                Deploy-Ollama
            }
            3 {
                Deploy-Backend -SupabaseUrl $SupabaseUrl -SupabaseKey $SupabaseKey
                Start-Sleep -Seconds 30
                Test-Deployment
            }
            4 {
                Test-Deployment
            }
            default {
                Write-Error "잘못된 선택입니다."
                exit 1
            }
        }
        
        Write-Host ""
        Write-Success "배포 스크립트 실행 완료!"
    }
    catch {
        Write-Error "배포 중 오류 발생: $_"
        exit 1
    }
}

# 스크립트 실행
Main
