const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); 

const app = express();
app.use(cors()); 

// 🔥 실무 검증 완료된 API 인증키
const PUBLIC_API_KEY = 'bf828022bb4535034959395893c59397fff91ac219c93670610575093972289d';

// 1. 데이터베이스 연결 설정
const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

// 2. 승강기 검색 API 
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) return res.status(400).send("검색할 건물명을 입력해주세요.");

    try {
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE A.건물명 LIKE $1
            LIMIT 50
        `;
        const result = await pool.query(sql, [`%${keyword}%`]);
        const elevators = result.rows;

        const elevatorsWithStatus = [];

        // [핵심 수정] 동시 다발적 요청(Promise.all) 대신 순차적 요청으로 변경
        for (const elevator of elevators) {
            const rawElevatorNo = elevator.승강기고유번호 || elevator.elevatorNo || elevator.elevator_no || elevator.승강기번호;

            if (!rawElevatorNo) {
                elevatorsWithStatus.push({ ...elevator, elvtrStts: "번호없음" });
                continue; // 다음 승강기로 넘어감
            }

            const safeElevatorNo = String(rawElevatorNo).trim().padStart(7, '0');

            try {
                // 검증된 getElevatorViewM 엔드포인트 호출
                const apiUrl = `https://apis.data.go.kr/B553664/ElevatorInformationService/getElevatorViewM?serviceKey=${PUBLIC_API_KEY}&elevator_no=${safeElevatorNo}&_type=json`;
                
                const response = await axios.get(apiUrl, { timeout: 5000 });

                if (typeof response.data === 'string' && response.data.includes('<errMsg>')) {
                    console.error(`[API 인증키 오류 추정] 승강기: ${safeElevatorNo}`);
                    elevatorsWithStatus.push({ ...elevator, elvtrStts: "API키오류" });
                    continue;
                }

                // 공공데이터의 기형적인 JSON 구조 커버 (items 껍질 유무)
                const items = response.data?.response?.body?.items?.item || response.data?.response?.body?.item;
                let currentStatus = "상태알수없음";

                if (items) {
                     const itemData = Array.isArray(items) ? items[0] : items;
                     // 정부 API 데이터의 elvtrStts 필드 최우선 추출
                     currentStatus = itemData.elvtrStts || itemData.elvtrSttsNm || "상태알수없음"; 
                }

                elevatorsWithStatus.push({ ...elevator, elvtrStts: currentStatus });

            } catch (apiError) {
                console.error(`❌ API 통신 실패 (승강기: ${safeElevatorNo}) - ${apiError.message}`);
                elevatorsWithStatus.push({ ...elevator, elvtrStts: "확인불가" }); 
            }

            // [가장 중요한 핵심] 공공데이터 서버 트래픽 차단을 피하기 위한 0.1초(100ms) 대기
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 반복문이 다 끝난 후 최종 결과를 전송
        res.json(elevatorsWithStatus);

    } catch (error) {
        console.error("DB 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

app.listen(3000, () => {
    console.log("🚀 승강기 API 서버가 [공공데이터 트래픽 차단 우회 모드]로 가동 시작!");
});

module.exports = app;
