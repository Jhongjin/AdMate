/**
 * 새로운 문서 업로드 API
 * 간단하고 안정적인 RAG 파이프라인 기반
 * 파일 중복 처리 로직 포함
 */

import { NextRequest, NextResponse } from 'next/server';
import { newDocumentProcessor } from '@/lib/services/NewDocumentProcessor';
import { ragProcessor, DocumentData } from '@/lib/services/RAGProcessor';
import { createPureClient } from '@/lib/supabase/server';

// Vercel 설정 - 서버 안정성 개선
export const runtime = 'nodejs';
export const maxDuration = 120; // 타임아웃 증가
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 하드코딩된 메모리 저장소 (개발 환경용)
interface Document {
  id: string;
  title: string;
  type: string;
  status: string;
  content: string;
  chunk_count: number;
  file_size: number;
  file_type: string;
  created_at: string;
  updated_at: string;
}

// 메모리에 문서 저장
let documents: Document[] = [];

    /**
     * 파일명 중복 검사 (Supabase 기반, 폴백 포함)
     */
    async function checkDuplicateFile(fileName: string): Promise<{ isDuplicate: boolean; existingDocument?: Document }> {
      try {
        console.log('🔍 파일명 중복 검사 시작:', fileName);

        const supabase = await createPureClient();
        
        // Supabase URL이 더미인지 확인
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        console.log('🔍 Supabase 환경변수 체크:', {
          supabaseUrl: supabaseUrl ? '설정됨' : '없음',
          isDummy: supabaseUrl?.includes('dummy') || supabaseUrl === 'https://dummy.supabase.co'
        });
        
        if (!supabase) {
          console.error('❌ Supabase 클라이언트 생성 실패');
          throw new Error('Supabase 클라이언트를 생성할 수 없습니다.');
        }

        // Supabase에서 파일명으로 검색
        const { data, error } = await supabase
          .from('documents')
          .select('id, title, created_at, file_size, chunk_count, status')
          .eq('title', fileName)
          .limit(1);

        if (error) {
          console.error('❌ Supabase 중복 검사 오류:', error);
          throw new Error(`중복 검사 실패: ${error.message}`);
        }

        const isDuplicate = data && data.length > 0;
        const existingDocument = isDuplicate ? {
          id: data[0].id,
          title: data[0].title,
          created_at: data[0].created_at,
          file_size: data[0].file_size || 0,
          chunk_count: data[0].chunk_count || 0,
          status: data[0].status || 'indexed'
        } : undefined;

        console.log('📋 중복 검사 결과 (Supabase):', {
          fileName,
          isDuplicate,
          existingDocumentId: existingDocument?.id,
          totalDocuments: data?.length || 0
        });

        return { isDuplicate, existingDocument };
      } catch (error) {
        console.error('❌ 중복 검사 중 오류:', error);
        throw error;
      }
    }

/**
 * 기존 문서 삭제 (덮어쓰기용 - Supabase 기반)
 */
async function deleteExistingDocument(documentId: string): Promise<boolean> {
  try {
    console.log('🗑️ 기존 문서 삭제 시작 (Supabase):', documentId);

    const supabase = await createPureClient();
    if (!supabase) {
      console.warn('⚠️ Supabase 연결 없음. 메모리 기반으로 폴백');
      const initialLength = documents.length;
      documents = documents.filter(doc => doc.id !== documentId);
      return documents.length < initialLength;
    }

    // Supabase에서 문서 및 관련 청크 삭제
    const { error: chunksError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (chunksError) {
      console.error('❌ 청크 삭제 오류:', chunksError);
    }

    const { error: docError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (docError) {
      console.error('❌ 문서 삭제 오류:', docError);
      return false;
    }

    // 메모리에서도 제거
    const initialLength = documents.length;
    documents = documents.filter(doc => doc.id !== documentId);

    console.log('✅ 기존 문서 삭제 완료 (Supabase):', documentId);
    console.log('📊 남은 문서 수:', documents.length);
    return true;
  } catch (error) {
    console.error('❌ 문서 삭제 중 오류:', error);
    return false;
  }
}

/**
 * 파일 확장자에 따른 타입 결정
 */
function getFileTypeFromExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return 'pdf';
    case 'docx':
      return 'docx';
    case 'doc':
      return 'docx'; // DOC도 DOCX로 처리
    case 'txt':
      return 'txt';
    case 'md':
      return 'txt'; // Markdown도 TXT로 처리
    default:
      return 'file';
  }
}

/**
 * 파일 업로드 및 처리
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 새로운 문서 업로드 API 시작 (메모리 저장)');

    const contentType = request.headers.get('content-type');
    console.log('📋 Content-Type:', contentType);

    // FormData 처리
    if (contentType?.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return NextResponse.json(
          { success: false, error: '파일이 제공되지 않았습니다.' },
          { status: 400 }
        );
      }

      // 파일 크기 검사 (20MB 제한)
      const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '20971520'); // 20MB
      if (file.size > maxFileSize) {
        return NextResponse.json(
          { 
            success: false, 
            error: `파일 크기가 ${Math.round(maxFileSize / 1024 / 1024)}MB를 초과합니다. 최대 20MB까지 업로드 가능합니다.`,
            fileSize: file.size,
            maxSize: maxFileSize
          },
          { status: 400 }
        );
      }

      // 파일 내용 읽기 (PDF는 ArrayBuffer로 처리)
      let fileContent;
      if (file.type === 'application/pdf') {
        // PDF 파일은 ArrayBuffer로 읽어서 Base64 인코딩
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 큰 파일의 경우 스택 오버플로우를 방지하기 위해 청크 단위로 처리
        let binaryString = '';
        const chunkSize = 8192; // 8KB 청크
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          binaryString += String.fromCharCode.apply(null, Array.from(chunk));
        }
        fileContent = btoa(binaryString);
      } else {
        // 텍스트 파일은 기존 방식 사용
        fileContent = await file.text();
      }
      
      // PDF 파일의 경우 기본 텍스트 생성
      let processedContent = fileContent;
      if (file.type === 'application/pdf') {
        processedContent = `PDF 문서: ${file.name}

파일 정보:
- 파일명: ${file.name}
- 파일 크기: ${(file.size / 1024 / 1024).toFixed(2)}MB
- 파일 타입: PDF
- 업로드 시간: ${new Date().toLocaleString('ko-KR')}

참고사항:
이 PDF 파일은 업로드되었습니다. 실제 PDF 내용 추출을 위해서는 서버사이드 PDF 처리 라이브러리가 필요하지만, 현재는 파일 메타데이터와 기본 정보가 저장됩니다.

실제 PDF 내용을 추출하려면:
1. pdf-parse 라이브러리 설치
2. 서버사이드에서 PDF 텍스트 추출
3. 추출된 텍스트를 청킹하여 임베딩 생성

이 파일은 관리자가 나중에 수동으로 처리하거나, PDF 처리 기능이 추가될 때까지 대기 상태로 유지됩니다.`;
      }

      // 문서 생성
      const documentId = `doc_${Date.now()}`;
      const documentData: DocumentData = {
        id: documentId,
        title: file.name,
        content: processedContent,
        type: getFileTypeFromExtension(file.name),
        file_size: file.size,
        file_type: file.type,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // RAG 처리 (청킹 + 임베딩 + 저장)
      console.log('🔄 RAG 처리 시작...', {
        documentId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      const ragResult = await ragProcessor.processDocument(documentData);
      console.log('✅ RAG 처리 완료:', {
        success: ragResult.success,
        chunkCount: ragResult.chunkCount,
        error: ragResult.error
      });
      
      // Supabase에 저장되므로 메모리 배열 추가 불필요
      
      console.log('✅ 파일 업로드 및 RAG 처리 완료:', {
        documentId,
        fileName: file.name,
        fileSize: file.size,
        chunkCount: ragResult.chunkCount,
        success: ragResult.success,
        totalDocuments: documents.length
      });

      return NextResponse.json({
        success: true,
        data: {
          documentId: documentId,
          message: ragResult.success 
            ? `파일이 성공적으로 업로드되고 ${ragResult.chunkCount}개 청크로 처리되었습니다.`
            : '파일 업로드는 성공했지만 RAG 처리 중 오류가 발생했습니다.',
          status: ragResult.success ? 'completed' : 'failed',
          chunkCount: ragResult.chunkCount
        }
      });
    }

    // JSON 요청 처리 (Base64 파일)
    if (contentType?.includes('application/json')) {
      let body;
      try {
        const text = await request.text();
        if (!text || text.trim() === '') {
          return NextResponse.json(
            { success: false, error: '요청 본문이 비어있습니다.' },
            { status: 400 }
          );
        }
        body = JSON.parse(text);
      } catch (error) {
        console.error('❌ JSON 파싱 오류:', error);
        return NextResponse.json(
          { success: false, error: '잘못된 JSON 형식입니다.' },
          { status: 400 }
        );
      }
      
      const { fileName, fileSize, fileType, fileContent, duplicateAction } = body;

      console.log('📋 업로드 요청 정보:', { fileName, fileSize, fileType, duplicateAction });

      if (!fileContent || !fileName) {
        return NextResponse.json(
          { success: false, error: '파일 내용과 파일명이 필요합니다.' },
          { status: 400 }
        );
      }

      // 파일 크기 검사 (20MB 제한)
      const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '20971520'); // 20MB
      if (fileSize > maxFileSize) {
        return NextResponse.json(
          { 
            success: false, 
            error: `파일 크기가 ${Math.round(maxFileSize / 1024 / 1024)}MB를 초과합니다. 최대 20MB까지 업로드 가능합니다.`,
            fileSize: fileSize,
            maxSize: maxFileSize
          },
          { status: 400 }
        );
      }

      // 파일명 중복 검사
      console.log('🔍 중복 검사 시작:', fileName);
      const { isDuplicate, existingDocument } = await checkDuplicateFile(fileName);
      console.log('🔍 중복 검사 완료:', { isDuplicate, existingDocumentId: existingDocument?.id });
      
      if (isDuplicate && !duplicateAction) {
        return NextResponse.json({
          success: false,
          error: 'DUPLICATE_FILE',
          data: {
            fileName,
            existingDocument: {
              id: existingDocument?.id,
              title: existingDocument?.title,
              created_at: existingDocument?.created_at,
              file_size: existingDocument?.file_size,
              chunk_count: existingDocument?.chunk_count,
              status: existingDocument?.status || 'indexed'
            },
            message: `'${fileName}' 파일이 이미 존재합니다. 어떻게 처리하시겠습니까?`
          }
        }, { status: 409 }); // Conflict
      }

      // 중복 처리 로직
      if (isDuplicate && duplicateAction) {
        if (duplicateAction === 'skip') {
          // 건너뛰기 시에는 아무것도 하지 않음 (RAG 처리 완전 건너뛰기)
          console.log('📝 건너뛰기 처리: 파일 업로드 및 RAG 처리 완전 취소', fileName);
          return NextResponse.json({
            success: false,
            error: 'FILE_SKIPPED',
            message: `'${fileName}' 파일을 건너뛰었습니다.`
          }, { status: 200 });
        }
        
        if (duplicateAction === 'overwrite' && existingDocument) {
          console.log('🔄 덮어쓰기 모드: 기존 문서 삭제 중...');
          const deleteSuccess = await deleteExistingDocument(existingDocument.id);
          
          if (!deleteSuccess) {
            return NextResponse.json({
              success: false,
              error: 'DELETE_FAILED',
              message: '기존 문서 삭제에 실패했습니다.'
            }, { status: 500 });
          }
          
          console.log('✅ 기존 문서 삭제 완료, 새 문서 업로드 진행...');
        }
      }

      // Base64 디코딩
      const decodedContent = atob(fileContent);
      
      // 문서 생성
      const documentId = `doc_${Date.now()}`;
      const documentData: DocumentData = {
        id: documentId,
        title: fileName,
        content: decodedContent,
        type: getFileTypeFromExtension(fileName),
        file_size: fileSize,
        file_type: fileType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // RAG 처리 (청킹 + 임베딩 + 저장)
      console.log('🔄 RAG 처리 시작 (Base64)...');
      const ragResult = await ragProcessor.processDocument(documentData);
      console.log('✅ RAG 처리 완료 (Base64):', ragResult);
      
      // Supabase에 저장되므로 메모리 배열 추가 불필요
      
      console.log('✅ Base64 파일 업로드 및 RAG 처리 완료:', {
        documentId,
        fileName,
        fileSize,
        chunkCount: ragResult.chunkCount,
        success: ragResult.success,
        totalDocuments: documents.length
      });

      return NextResponse.json({
        success: true,
        data: {
          documentId: documentId,
          message: ragResult.success 
            ? `파일이 성공적으로 업로드되고 ${ragResult.chunkCount}개 청크로 처리되었습니다.`
            : '파일 업로드는 성공했지만 RAG 처리 중 오류가 발생했습니다.',
          status: ragResult.success ? 'completed' : 'failed',
          chunkCount: ragResult.chunkCount
        }
      });
    }

    return NextResponse.json(
      { success: false, error: '지원하지 않는 Content-Type입니다.' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ 업로드 API 오류:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : '파일 업로드 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * 문서 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    console.log('📋 문서 목록 조회 (Supabase 기반):', { limit, offset, status, type });

    // Supabase 클라이언트 생성
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        db: { schema: 'public' }
      }
    );

    // Supabase에서 문서 목록 조회
    let query = supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 필터 적용
    if (status) {
      query = query.eq('status', status);
    }

    if (type) {
      query = query.eq('type', type);
    }

    const { data: documents, error: documentsError } = await query;

    if (documentsError) {
      console.error('❌ 문서 조회 오류:', documentsError);
      throw new Error(`문서 조회 실패: ${documentsError.message}`);
    }

    console.log('📊 Supabase 쿼리 결과:', {
      documents: documents,
      documentsLength: documents?.length,
      firstDocument: documents?.[0],
      error: documentsError
    });

    // 전체 문서 수 조회 (통계용)
    let countQuery = supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    if (type) {
      countQuery = countQuery.eq('type', type);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error('❌ 문서 수 조회 오류:', countError);
    }

    // 통계 계산을 위한 전체 문서 조회
    const { data: allDocuments, error: statsError } = await supabase
      .from('documents')
      .select('status, chunk_count, type');

    if (statsError) {
      console.error('❌ 통계 조회 오류:', statsError);
    }
    
    // 타입별 통계 계산
    const fileDocuments = allDocuments?.filter(doc => ['pdf', 'docx', 'txt'].includes(doc.type)) || [];
    const urlDocuments = allDocuments?.filter(doc => doc.type === 'url') || [];
    
    const stats = {
      // 전체 통계 (기존 호환성 유지)
      totalDocuments: totalCount || 0,
      completedDocuments: allDocuments?.filter(doc => doc.status === 'indexed' || doc.status === 'completed').length || 0,
      totalChunks: allDocuments?.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0) || 0,
      pendingDocuments: allDocuments?.filter(doc => doc.status === 'processing').length || 0,
      failedDocuments: allDocuments?.filter(doc => doc.status === 'failed').length || 0,
      
      // 파일 문서 통계 (PDF, DOCX, TXT)
      fileStats: {
        totalDocuments: fileDocuments.length,
        completedDocuments: fileDocuments.filter(doc => doc.status === 'indexed' || doc.status === 'completed').length,
        totalChunks: fileDocuments.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0),
        pendingDocuments: fileDocuments.filter(doc => doc.status === 'processing').length,
        failedDocuments: fileDocuments.filter(doc => doc.status === 'failed').length,
      },
      
      // URL 문서 통계
      urlStats: {
        totalDocuments: urlDocuments.length,
        completedDocuments: urlDocuments.filter(doc => doc.status === 'indexed' || doc.status === 'completed').length,
        totalChunks: urlDocuments.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0),
        pendingDocuments: urlDocuments.filter(doc => doc.status === 'processing').length,
        failedDocuments: urlDocuments.filter(doc => doc.status === 'failed').length,
      }
    };

    console.log('📊 문서 목록 조회 완료 (Supabase):', {
      documentsCount: documents?.length || 0,
      totalDocuments: totalCount || 0,
      stats: stats
    });

    // documents 배열이 null이거나 undefined인 경우 빈 배열로 처리
    const safeDocuments = documents || [];
    
    // content 필드를 제거하여 응답 크기를 줄이고 직렬화 문제를 방지
    const documentsForResponse = safeDocuments.map(doc => ({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      status: doc.status,
      chunk_count: doc.chunk_count,
      file_size: doc.file_size,
      file_type: doc.file_type,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      document_url: doc.document_url,
      url: doc.url,
      size: doc.size
      // content 필드는 제외 (너무 크고 UI에서 사용하지 않음)
    }));
    
    console.log('📤 API 응답 전송:', {
      success: true,
      documentsCount: documentsForResponse.length,
      firstDocument: documentsForResponse[0],
      stats: stats
    });

    return NextResponse.json({
      success: true,
      data: {
        documents: documentsForResponse,
        stats: stats,
        pagination: {
          limit,
          offset,
          total: totalCount || 0
        }
      }
    });

  } catch (error) {
    console.error('❌ 문서 목록 조회 오류:', error);
    return NextResponse.json(
      { 
        success: false,
        error: '문서 목록 조회 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : JSON.stringify(error)
      },
      { status: 500 }
    );
  }
}

/**
 * 파일 덮어쓰기 처리
 */
export async function PUT(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('multipart/form-data')) {
      return await handleFileOverwrite(request);
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: '지원하지 않는 Content-Type입니다.' 
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('❌ 파일 덮어쓰기 오류:', error);
    return NextResponse.json(
      { 
        success: false,
        error: '파일 덮어쓰기 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * 파일 덮어쓰기 처리 함수
 */
async function handleFileOverwrite(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string;
    const existingDocumentId = formData.get('documentId') as string;

    if (!file || !fileName || !existingDocumentId) {
      return NextResponse.json(
        { 
          success: false,
          error: '파일, 파일명, 문서 ID가 모두 필요합니다.' 
        },
        { status: 400 }
      );
    }

    // 파일 내용 읽기
    const fileContent = await file.text();
    
    // 문서 업데이트
    const documentId = existingDocumentId;
    const documentData: DocumentData = {
      id: documentId,
      title: fileName,
      content: fileContent,
      type: 'file',
      file_size: file.size,
      file_type: file.type,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // RAG 처리 (청킹 + 임베딩 + 저장)
    console.log('🔄 파일 덮어쓰기 RAG 처리 시작...');
    const ragResult = await ragProcessor.processDocument(documentData);

    // 메모리 저장소 업데이트
    const documentIndex = documents.findIndex(doc => doc.id === documentId);
    if (documentIndex !== -1) {
      documents[documentIndex] = {
        id: documentId,
        title: fileName,
        type: getFileTypeFromExtension(fileName),
        status: ragResult.success ? 'completed' : 'failed',
        content: fileContent.substring(0, 1000),
        chunk_count: ragResult.chunkCount,
        file_size: file.size,
        file_type: file.type,
        created_at: documents[documentIndex].created_at,
        updated_at: new Date().toISOString()
      };
    }
    
    console.log(`✅ 파일 덮어쓰기 완료: ${fileName} -> ${documentId}`);

    return NextResponse.json({
      success: true,
      message: '파일이 성공적으로 덮어쓰기되었습니다.',
      data: {
        documentId: documentId,
        message: ragResult.success 
          ? `파일이 성공적으로 덮어쓰기되고 ${ragResult.chunkCount}개 청크로 처리되었습니다.`
          : '파일 덮어쓰기는 성공했지만 RAG 처리 중 오류가 발생했습니다.',
        status: ragResult.success ? 'completed' : 'failed',
        chunkCount: ragResult.chunkCount
      }
    });

  } catch (error) {
    console.error('❌ 파일 덮어쓰기 처리 오류:', error);
    return NextResponse.json(
      { 
        success: false,
        error: '파일 덮어쓰기 처리 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * 문서 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const url = searchParams.get('url');

    if (!documentId && !url) {
      return NextResponse.json(
        { 
          success: false,
          error: '문서 ID 또는 URL이 제공되지 않았습니다.' 
        },
        { status: 400 }
      );
    }

    console.log('🗑️ 문서 삭제 요청:', { documentId, url });

    // Supabase 클라이언트 생성
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let targetDocumentId = documentId;

    // URL이 제공된 경우, URL로 문서 ID를 찾기
    if (url && !documentId) {
      const { data: documents, error: findError } = await supabase
        .from('documents')
        .select('id, title, url')
        .eq('url', url)
        .limit(1);

      if (findError) {
        throw new Error(`문서 검색 실패: ${findError.message}`);
      }

      if (!documents || documents.length === 0) {
        return NextResponse.json(
          { 
            success: false,
            error: '해당 URL과 일치하는 문서를 찾을 수 없습니다.' 
          },
          { status: 404 }
        );
      }

      targetDocumentId = documents[0].id;
    }

    // 문서와 관련된 모든 청크 삭제
    const { error: chunksError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', targetDocumentId);

    if (chunksError) {
      console.warn('청크 삭제 실패:', chunksError);
    }

    // 문서 삭제
    const { error: documentError } = await supabase
      .from('documents')
      .delete()
      .eq('id', targetDocumentId);

    if (documentError) {
      throw new Error(`문서 삭제 실패: ${documentError.message}`);
    }

    // 메모리에서도 삭제
    documents = documents.filter(doc => doc.id !== targetDocumentId);

    console.log(`✅ 문서 삭제 완료: ${targetDocumentId}`);

    return NextResponse.json({
      success: true,
      message: '문서와 관련된 모든 데이터가 성공적으로 삭제되었습니다.',
      data: {
        deletedChunks: 0, // 실제로는 삭제된 청크 수를 반환해야 함
        deletedEmbeddings: 0
      }
    });

  } catch (error) {
    console.error('❌ 문서 삭제 오류:', error);
    return NextResponse.json(
      { 
        success: false,
        error: '문서 삭제 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}