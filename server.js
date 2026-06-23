const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); 

const app = express();
app.use(cors()); 

// ★ 대리님의 진짜 공공데이터포털(Decoding) 인증키를 넣어주세요.
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

        const elevatorsWithStatus = await Promise.all(elevators.map(async (elevator) => {
            
            const rawElevatorNo = elevator.승강기고유번호 || elevator.elevatorNo || elevator.elevator_no || elevator.승강기번호;

            if (!rawElevatorNo) {
                return { ...elevator, 실시간운행상태: "번호없음" };
            }

            const safeElevatorNo = String(rawElevatorNo).trim().padStart(7, '0');

            try {
                // 🔥 [대리님이 찾아낸 핵심 해결책 적용!] 
                // 신버전 공공데이터 API 주소 (B553664 포함)로 교체 완료
                const apiUrl = `https://apis.data.go.kr/B553664/ElevatorInformationService/getElevatorView?serviceKey=${PUBLIC_API_KEY}&elevator_no=${safeElevatorNo}&_type=json`;
                
                const response = await axios.get(apiUrl, { timeout: 5000 });

                if (typeof response.data === 'string' && response.data.includes('<errMsg>')) {
                    console.error(`[API 인증키 오류 추정] 승강기: ${safeElevatorNo}`);
                    return { ...elevator, 실시간운행상태: "API키오류" }; 
                }

                // 응답받은 데이터에서 상태값 꺼내기
                const items = response.data?.response?.body?.items?.item;
                let currentStatus = "상태알수없음";

                if (items) {
                     const itemData = Array.isArray(items) ? items[0] : items;
                     currentStatus = itemData.elvtrSttsNm || "상태알수없음"; 
                }

                return { ...elevator, 실시간운행상태: currentStatus };

            } catch (apiError) {
                console.error(`❌ API 통신 실패 (승강기: ${safeElevatorNo})`);
                if (apiError.response) {
                    console.error(`거절 사유: ${apiError.response.status} - ${apiError.response.data}`);
                } else {
                    console.error(`네트워크/기타 에러: ${apiError.message}`);
                }
                return { ...elevator, 실시간운행상태: "확인불가" }; 
            }
        }));

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
    console.log("🚀 승강기 API 서버가 [신버전 공공데이터 최적화 모드]로 가동 시작!");
});

module.exports = app;
