const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());

// 인증키 확인 (정확한 Decoding 키인지 다시 한번 확인 부탁드립니다)
const PUBLIC_API_KEY = 'bf828022bb4535034959395893c59397fff91ac219c93670610575093972289d';

const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

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
            
            // [디버깅 1] DB에서 꺼낸 전체 객체 확인
            console.log("🔍 DB에서 꺼낸 데이터 객체:", JSON.stringify(elevator));

            const rawElevatorNo = elevator.승강기고유번호 || elevator.elevatorNo || elevator.elevator_no || elevator.승강기번호;

            if (!rawElevatorNo) {
                return { ...elevator, 실시간운행상태: "번호없음" };
            }

            // [디버깅 2] 정부 서버에 보낼 규격화된 번호 확인
            const safeElevatorNo = String(rawElevatorNo).trim().padStart(7, '0');
            console.log("🚀 정부 서버에 보낼 승강기 번호:", safeElevatorNo);

            try {
                const apiUrl = `https://apis.data.go.kr/B553664/ElevatorInformationService/getElevatorViewM?serviceKey=${PUBLIC_API_KEY}&elevator_no=${safeElevatorNo}&_type=json`;
                
                const response = await axios.get(apiUrl, { timeout: 5000 });

                // [디버깅 3] 정부 서버에서 받은 응답 전체 로그 기록
                console.log("📡 정부 API 응답 데이터:", JSON.stringify(response.data));

                if (typeof response.data === 'string' && response.data.includes('<errMsg>')) {
                    return { ...elevator, 실시간운행상태: "API키오류" };
                }

                const items = response.data?.response?.body?.items?.item;
                let currentStatus = "상태알수없음";

                if (items) {
                     const itemData = Array.isArray(items) ? items[0] : items;
                     currentStatus = itemData.elvtrSttsNm || "상태알수없음"; 
                }

                return { ...elevator, 실시간운행상태: currentStatus };

            } catch (apiError) {
                console.error(`❌ API 통신 실패 (승강기: ${safeElevatorNo})`, apiError.message);
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
    console.log("🚀 승강기 API 서버가 [디버깅 모드]로 가동 시작!");
});

module.exports = app;
