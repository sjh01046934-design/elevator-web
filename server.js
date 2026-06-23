const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); // 공공데이터 API 통신 패키지

const app = express();
app.use(cors()); // 외부 웹/앱 접속 허용

// ★★★ [매우 중요] 공공데이터포털(data.go.kr)의 '승강기정보조회' 전용 인증키를 넣어야 합니다!
// 이전에 보여주셨던 'bf828...' 형태의 카카오 키를 넣으면 무조건 차단됩니다.
// 키 끝에 == 또는 %3D%3D 가 붙어있는 'Decoding(디코딩)' 키를 복사해서 넣어주세요.
const PUBLIC_API_KEY = '여기에_공공데이터포털_디코딩_인증키를_넣어주세요';

// 1. 데이터베이스 연결 설정 (Supabase 클라우드 데이터베이스)
const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

// 2. 승강기 검색 API (건물명 검색 + 공공데이터 실시간 상태 융합)
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) return res.status(400).send("검색할 건물명을 입력해주세요.");

    try {
        // [1단계] Supabase DB에서 승강기 기본 정보와 좌표 가져오기
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE A.건물명 LIKE $1
            LIMIT 50
        `;
        const result = await pool.query(sql, [`%${keyword}%`]);
        const elevators = result.rows;

        // [2단계] DB에서 찾은 각 승강기 번호로 정부 API에 실시간 상태 조회
        const elevatorsWithStatus = await Promise.all(elevators.map(async (elevator) => {
            
            // DB 컬럼명이 무엇이든 유연하게 잡아내기
            const rawElevatorNo = elevator.승강기고유번호 || elevator.elevatorNo || elevator.elevator_no || elevator.승강기번호;

            if (!rawElevatorNo) {
                return { ...elevator, 실시간운행상태: "번호없음" };
            }

            // [방어막 1] 승강기 번호를 무조건 7자리로 맞추기 (앞에 0이 잘렸을 경우 복원)
            const safeElevatorNo = String(rawElevatorNo).trim().padStart(7, '0');

            try {
                // [방어막 2] HTTPS 보안 통신 적용 및 응답 대기 5초 제한
                const apiUrl = `https://apis.data.go.kr/openapi/service/ElevatorInformationService/getElevatorView?serviceKey=${PUBLIC_API_KEY}&elevator_no=${safeElevatorNo}&_type=json`;
                
                const response = await axios.get(apiUrl, { timeout: 5000 });

                // [방어막 3] 정부 서버가 에러를 뱉었는지 감지 (인증키 오류 등)
                if (typeof response.data === 'string' && response.data.includes('<errMsg>')) {
                    console.error(`[API 인증키 오류 추정] 승강기: ${safeElevatorNo}`);
                    return { ...elevator, 실시간운행상태: "API키오류" }; // 지도에 주황색 배지로 표시됩니다.
                }

                // 정상 응답에서 상태값 파싱
                const items = response.data?.response?.body?.items?.item;
                let currentStatus = "상태알수없음";

                if (items) {
                     const itemData = Array.isArray(items) ? items[0] : items;
                     currentStatus = itemData.elvtrSttsNm || "상태알수없음"; 
                }

                return { ...elevator, 실시간운행상태: currentStatus };

            } catch (apiError) {
                // 통신이 완전히 끊겼을 때 서버 로그(Render)에 원인 기록
                console.error(`❌ API 통신 실패 (승강기: ${safeElevatorNo})`);
                if (apiError.response) {
                    console.error(`거절 사유: ${apiError.response.status} - ${apiError.response.data}`);
                } else {
                    console.error(`네트워크/기타 에러: ${apiError.message}`);
                }
                return { ...elevator, 실시간운행상태: "확인불가" }; 
            }
        }));

        // [3단계] 완성된 최종 데이터를 프론트엔드로 발송
        res.json(elevatorsWithStatus);

    } catch (error) {
        console.error("DB 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

// 3. 메인 HTML 파일 배달
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

// 4. 통신 서버 켜기
app.listen(3000, () => {
    console.log("🚀 승강기 API 서버가 [공공데이터 실시간 연동 완벽 방어 모드]로 가동 시작!");
});

// [Render 배포용 필수 코드]
module.exports = app;
