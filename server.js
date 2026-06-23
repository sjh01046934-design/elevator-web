const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); // [추가됨] 공공데이터 API와 통신하기 위한 패키지

const app = express();
app.use(cors()); // 외부 웹/앱에서 접속 허용

// [추가됨] 공공데이터포털 발급 인증키 (인코딩/디코딩 중 작동하는 키 사용)
const PUBLIC_API_KEY = 'bf828022bb4535034959395893c59397fff91ac219c93670610575093972289d';

// 1. 데이터베이스 연결 설정 (Supabase 클라우드 데이터베이스)
const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: {
        rejectUnauthorized: false
    }
});

// 2. 승강기 검색 API 만들기 (건물명으로 검색 + 실시간 상태 융합)
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) {
        return res.status(400).send("검색할 건물명을 입력해주세요.");
    }

    try {
        // [1단계] 기존 로직: Supabase DB에서 승강기 기본 정보와 좌표를 가져옵니다.
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE A.건물명 LIKE $1
            LIMIT 50
        `;
        const result = await pool.query(sql, [`%${keyword}%`]);
        const elevators = result.rows;

        // [2단계] 핵심 추가: DB에서 찾은 각 승강기 번호로 공공데이터 API에 실시간 상태 조회
        // Promise.all을 사용하여 검색된 승강기들의 상태를 동시에 빠르게 조회합니다.
        const elevatorsWithStatus = await Promise.all(elevators.map(async (elevator) => {
            // DB에 저장된 승강기 번호 컬럼명 입력 (예: '승강기번호', '승강기고유번호' 등)
            // ★ 대리님의 실제 DB 컬럼명에 맞게 아래 '승강기번호' 부분을 꼭 수정해 주세요!
            const elevatorNo = elevator.승강기번호; 

            if (!elevatorNo) {
                return { ...elevator, 실시간운행상태: "번호없음" };
            }

            try {
                // 공공데이터 통신 URL (파라미터 자동 인코딩 오류를 막기 위해 주소에 직접 결합)
                // ★ API 명세서에 따라 기본 URL 주소가 다를 수 있으니 확인이 필요합니다.
                const apiUrl = `http://apis.data.go.kr/openapi/service/ElevatorInformationService/getElevatorView?serviceKey=${PUBLIC_API_KEY}&elevator_no=${elevatorNo}&_type=json`;
                
                const response = await axios.get(apiUrl);

                // API 응답 구조에서 상태값(elvtrSttsNm) 빼오기 
                const items = response.data?.response?.body?.items?.item;
                let currentStatus = "상태알수없음";

                if (items) {
                     // 검색 결과가 여러 개일 경우를 대비해 첫 번째 항목 추출
                     const itemData = Array.isArray(items) ? items[0] : items;
                     currentStatus = itemData.elvtrSttsNm || "상태알수없음"; // 예: '운행중', '합격상실' 등
                }

                // 기존 DB 정보(elevator)에 '실시간운행상태' 항목을 새롭게 추가
                return { ...elevator, 실시간운행상태: currentStatus };

            } catch (apiError) {
                console.error(`API 호출 실패 (승강기번호: ${elevatorNo}):`, apiError.message);
                // 통신 실패 시 에러를 내지 않고 '확인불가' 상태로 지도에 정상 표시되게 처리
                return { ...elevator, 실시간운행상태: "확인불가" }; 
            }
        }));

        // [3단계] 실시간 상태가 모두 결합된 최종 데이터를 웹브라우저/스마트폰으로 발송
        res.json(elevatorsWithStatus);

    } catch (error) {
        console.error("DB 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

// 3. 메인 HTML 파일 서빙
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

// 4. 서버 구동
app.listen(3000, () => {
    console.log("🚀 승강기 API 서버가 [공공데이터 실시간 연동 모드]로 3000번 포트에서 가동을 시작했습니다!");
});

module.exports = app;
