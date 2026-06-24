const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); 
const NodeCache = require('node-cache'); // [추가] 인메모리 캐시 모듈

const app = express();
app.use(cors()); 

// 🔥 실무 검증 완료된 API 인증키
const PUBLIC_API_KEY = 'bf828022bb4535034959395893c59397fff91ac219c93670610575093972289d';

// 🔥 캐시 저장소 생성 (데이터를 10분(600초) 동안 보관)
const statusCache = new NodeCache({ stdTTL: 600 });

// 1. 데이터베이스 연결 설정
const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

// [기능 1] 초고속 DB 검색 (지도 마커 렌더링용)
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) return res.status(400).send("검색할 건물명을 입력해주세요.");

    try {
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE A.건물명 LIKE $1
            LIMIT 1500  /* 🚀 대규모 단지도 모두 나오도록 1500으로 확장! */
        `;
        const result = await pool.query(sql, [`%${keyword}%`]);
        
        // 공공데이터 API를 거치지 않고 DB 데이터 그대로 즉시 리턴 (0.1초 컷)
        res.json(result.rows);

    } catch (error) {
        console.error("DB 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

// [기능 2] 실시간 운행상태 조회 API (캐싱 적용 완료!)
app.get('/api/realtime-status', async (req, res) => {
    const elevatorNo = req.query.elevatorNo; // 단일 승강기 번호
    if (!elevatorNo) return res.status(400).json({ status: "번호없음" });

    const safeElevatorNo = String(elevatorNo).trim().padStart(7, '0');
    
    // 💡 [핵심] 1. 캐시 메모리에 이 승강기 번호가 있는지 먼저 확인합니다.
    const cachedStatus = statusCache.get(safeElevatorNo);
    if (cachedStatus) {
        // 이미 10분 내에 조회한 적이 있다면 정부 서버를 찌르지 않고 즉시 반환!
        return res.json({ status: cachedStatus }); 
    }

    try {
        // 2. 캐시에 없으면 그때서야 정부 API를 호출합니다.
        const apiUrl = `https://apis.data.go.kr/B553664/ElevatorInformationService/getElevatorViewM?serviceKey=${PUBLIC_API_KEY}&elevator_no=${safeElevatorNo}&_type=json`;
        
        const response = await axios.get(apiUrl, { timeout: 3000 });

        if (typeof response.data === 'string' && response.data.includes('<errMsg>')) {
            console.error(`[API 인증키 오류 추정] 승강기: ${safeElevatorNo}`);
            return res.json({ status: "API키오류" }); 
        }

        // 공공데이터의 기형적인 JSON 구조 커버 (items 껍질 유무)
        const items = response.data?.response?.body?.items?.item || response.data?.response?.body?.item;
        let currentStatus = "상태알수없음";

        if (items) {
             const itemData = Array.isArray(items) ? items[0] : items;
             // 정부 API 데이터의 elvtrStts 필드 최우선 추출
             currentStatus = itemData.elvtrStts || itemData.elvtrSttsNm || "상태알수없음"; 
        }

        // 💡 [핵심] 3. 정부에서 가져온 따끈따끈한 결과를 10분 동안 캐시에 저장해 둡니다.
        statusCache.set(safeElevatorNo, currentStatus);

        res.json({ status: currentStatus });

    } catch (error) {
        console.error(`❌ API 통신 실패 (승강기: ${safeElevatorNo}) - ${error.message}`);
        res.json({ status: "확인불가" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

app.listen(3000, () => {
    console.log("🚀 승강기 API 서버가 [인메모리 캐싱 + 1500대 확장 모드]로 가동 시작했습니다!");
});

module.exports = app;
