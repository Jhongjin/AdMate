#!/usr/bin/env node

/**
 * Railway + Ollama 배포 테스트 스크립트
 * 배포된 서비스의 상태와 기능을 종합적으로 테스트
 */

const https = require('https');
const http = require('http');

// 색상 출력을 위한 ANSI 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  colorLog('green', `✅ ${message}`);
}

function error(message) {
  colorLog('red', `❌ ${message}`);
}

function warning(message) {
  colorLog('yellow', `⚠️ ${message}`);
}

function info(message) {
  colorLog('blue', `ℹ️ ${message}`);
}

function title(message) {
  colorLog('cyan', `\n🚀 ${message}`);
}

// HTTP 요청 함수
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const startTime = Date.now();
    
    const req = protocol.request(url, {
      method: 'GET',
      timeout: 30000,
      ...options
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          responseTime
        });
      });
    });
    
    req.on('error', (err) => {
      const responseTime = Date.now() - startTime;
      reject({ ...err, responseTime });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// POST 요청 함수
function postRequest(url, body) {
  return makeRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });
}

// 테스트 클래스
class RailwayDeploymentTester {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // 마지막 슬래시 제거
    this.testResults = {
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  async runAllTests() {
    title('Railway + Ollama 배포 테스트 시작');
    info(`대상 URL: ${this.baseUrl}`);
    
    try {
      await this.testBasicConnectivity();
      await this.testHealthEndpoint();
      await this.testModelsEndpoint();
      await this.testChatEndpoint();
      await this.testPerformance();
      await this.testErrorHandling();
      
      this.printSummary();
      
      // 종료 코드 설정
      process.exit(this.testResults.failed > 0 ? 1 : 0);
      
    } catch (error) {
      error(`테스트 실행 중 치명적 오류: ${error.message}`);
      process.exit(1);
    }
  }

  async testBasicConnectivity() {
    title('1. 기본 연결성 테스트');
    
    try {
      const response = await makeRequest(this.baseUrl);
      
      if (response.status === 200) {
        success(`기본 연결 성공 (${response.responseTime}ms)`);
        
        try {
          const data = JSON.parse(response.data);
          info(`서비스: ${data.service || 'Unknown'}`);
          info(`버전: ${data.version || 'Unknown'}`);
          this.pass();
        } catch (e) {
          warning('응답이 JSON 형식이 아닙니다');
          this.warning();
        }
      } else {
        error(`기본 연결 실패: HTTP ${response.status}`);
        this.fail();
      }
    } catch (err) {
      error(`기본 연결 오류: ${err.message}`);
      this.fail();
    }
  }

  async testHealthEndpoint() {
    title('2. 헬스 체크 테스트');
    
    try {
      const response = await makeRequest(`${this.baseUrl}/health`);
      
      if (response.status === 200) {
        success(`헬스 체크 성공 (${response.responseTime}ms)`);
        
        try {
          const data = JSON.parse(response.data);
          info(`전체 상태: ${data.status}`);
          info(`Ollama 상태: ${data.ollama || data.ollama_status}`);
          
          if (data.ollama === 'connected' || data.ollama_status === 'connected') {
            success('Ollama 서비스 연결됨');
            this.pass();
          } else {
            warning('Ollama 서비스 연결되지 않음');
            this.warning();
          }
        } catch (e) {
          warning('헬스 체크 응답 파싱 실패');
          this.warning();
        }
      } else {
        error(`헬스 체크 실패: HTTP ${response.status}`);
        this.fail();
      }
    } catch (err) {
      error(`헬스 체크 오류: ${err.message}`);
      this.fail();
    }
  }

  async testModelsEndpoint() {
    title('3. 모델 목록 테스트');
    
    try {
      const response = await makeRequest(`${this.baseUrl}/api/models`);
      
      if (response.status === 200) {
        success(`모델 목록 조회 성공 (${response.responseTime}ms)`);
        
        try {
          const data = JSON.parse(response.data);
          const models = data.models || [];
          
          info(`사용 가능한 모델 수: ${models.length}`);
          
          if (models.length > 0) {
            models.slice(0, 3).forEach(model => {
              info(`- ${typeof model === 'string' ? model : model.name || 'Unknown'}`);
            });
            this.pass();
          } else {
            warning('사용 가능한 모델이 없습니다');
            this.warning();
          }
        } catch (e) {
          warning('모델 목록 응답 파싱 실패');
          this.warning();
        }
      } else {
        error(`모델 목록 조회 실패: HTTP ${response.status}`);
        this.fail();
      }
    } catch (err) {
      error(`모델 목록 조회 오류: ${err.message}`);
      this.fail();
    }
  }

  async testChatEndpoint() {
    title('4. 채팅 API 테스트');
    
    const testMessages = [
      'Hello, how are you?',
      'Meta 광고 정책에 대해 알려주세요',
      '안녕하세요'
    ];

    for (const message of testMessages) {
      try {
        info(`테스트 메시지: "${message}"`);
        
        const response = await postRequest(`${this.baseUrl}/api/chat`, {
          message: message
        });
        
        if (response.status === 200) {
          success(`채팅 응답 성공 (${response.responseTime}ms)`);
          
          try {
            const data = JSON.parse(response.data);
            
            if (data.response && data.response.length > 0) {
              info(`응답 길이: ${data.response.length} 문자`);
              info(`처리 시간: ${data.processing_time || 0}ms`);
              info(`모델: ${data.model || 'Unknown'}`);
              
              // 응답 품질 간단 체크
              if (data.response.length > 50) {
                success('충분한 길이의 응답');
              } else {
                warning('짧은 응답');
              }
              
              this.pass();
            } else {
              warning('빈 응답');
              this.warning();
            }
          } catch (e) {
            warning('채팅 응답 파싱 실패');
            this.warning();
          }
        } else {
          error(`채팅 요청 실패: HTTP ${response.status}`);
          this.fail();
        }
      } catch (err) {
        error(`채팅 요청 오류: ${err.message}`);
        this.fail();
      }
      
      // 요청 간 간격
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async testPerformance() {
    title('5. 성능 테스트');
    
    const performanceTests = [
      { name: '기본 연결', url: this.baseUrl },
      { name: '헬스 체크', url: `${this.baseUrl}/health` },
      { name: '모델 목록', url: `${this.baseUrl}/api/models` }
    ];

    for (const test of performanceTests) {
      try {
        const response = await makeRequest(test.url);
        
        if (response.responseTime < 1000) {
          success(`${test.name}: ${response.responseTime}ms (빠름)`);
          this.pass();
        } else if (response.responseTime < 5000) {
          warning(`${test.name}: ${response.responseTime}ms (보통)`);
          this.warning();
        } else {
          error(`${test.name}: ${response.responseTime}ms (느림)`);
          this.fail();
        }
      } catch (err) {
        error(`${test.name} 성능 테스트 실패: ${err.message}`);
        this.fail();
      }
    }
  }

  async testErrorHandling() {
    title('6. 오류 처리 테스트');
    
    const errorTests = [
      {
        name: '잘못된 엔드포인트',
        url: `${this.baseUrl}/api/nonexistent`,
        expectedStatus: 404
      },
      {
        name: '빈 채팅 메시지',
        url: `${this.baseUrl}/api/chat`,
        method: 'POST',
        body: { message: '' },
        expectedStatus: 400
      }
    ];

    for (const test of errorTests) {
      try {
        let response;
        
        if (test.method === 'POST') {
          response = await postRequest(test.url, test.body);
        } else {
          response = await makeRequest(test.url);
        }
        
        if (response.status === test.expectedStatus) {
          success(`${test.name}: 올바른 오류 응답 (${response.status})`);
          this.pass();
        } else {
          warning(`${test.name}: 예상과 다른 응답 (${response.status}, 예상: ${test.expectedStatus})`);
          this.warning();
        }
      } catch (err) {
        // 일부 오류는 예상된 것일 수 있음
        warning(`${test.name}: ${err.message}`);
        this.warning();
      }
    }
  }

  pass() {
    this.testResults.passed++;
  }

  fail() {
    this.testResults.failed++;
  }

  warning() {
    this.testResults.warnings++;
  }

  printSummary() {
    title('테스트 결과 요약');
    
    success(`통과: ${this.testResults.passed}`);
    if (this.testResults.warnings > 0) {
      warning(`경고: ${this.testResults.warnings}`);
    }
    if (this.testResults.failed > 0) {
      error(`실패: ${this.testResults.failed}`);
    }
    
    const total = this.testResults.passed + this.testResults.failed + this.testResults.warnings;
    const successRate = total > 0 ? ((this.testResults.passed / total) * 100).toFixed(1) : 0;
    
    info(`전체 성공률: ${successRate}%`);
    
    if (this.testResults.failed === 0) {
      success('🎉 모든 핵심 테스트가 통과했습니다!');
    } else {
      error('❌ 일부 테스트가 실패했습니다. 배포를 확인해주세요.');
    }
  }
}

// 메인 실행
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    error('사용법: node test-deployment.js <RAILWAY_URL>');
    error('예시: node test-deployment.js https://your-app.railway.app');
    process.exit(1);
  }
  
  const baseUrl = args[0];
  const tester = new RailwayDeploymentTester(baseUrl);
  
  await tester.runAllTests();
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 테스트 스크립트 오류:', error);
    process.exit(1);
  });
}

module.exports = { RailwayDeploymentTester };
