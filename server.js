const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); 
const NodeCache = require('node-cache'); // 인메모리 캐시 모듈

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

// [기능 1] 초고속 DB 검색 (상호명-공식건물명 주소 교차 매칭 알고리즘 고도화)
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    const address = req.query.address; // 프론트단에서 전달한 주소 컨텍스트 백업 인자 추가
    
    if (!keyword) return res.status(400).send("검색어를 입력해주세요.");

    try {
        let sql = "";
        let queryParams = [];

        // 💡 [개선] 주소 정보가 함께 들어온 경우, 건물명뿐만 아니라 주소 텍스트 기반으로도 교차 검색을 수행하여 '더클래식500'을 강제 유입시킴
        if (address) {
            sql = `
                SELECT A.*, B.위도, B.경도 
                FROM elevators_raw A
                LEFT JOIN coords_raw B ON A.건물명 = B.건물명
                WHERE A.건물명 LIKE $1 OR A.주소1 LIKE $2 OR A.주소2 LIKE $2
                LIMIT 1500
            `;
            queryParams = [`%${keyword}%`, `%${address}%`];
        } else {
            sql = `
                SELECT A.*, B.위도, B.경도 
                FROM elevators_raw A
                LEFT JOIN coords_raw B ON A.건물명 = B.건물명
                WHERE A.건물명 LIKE $1 OR A.주소1 LIKE $1
                LIMIT 1500
            `;
            queryParams = [`%${keyword}%`];
        }

        const result = await pool.query(sql, queryParams);
        res.json(result.rows);

    } catch (error) {
        console.error("Supabase 데이터베이스 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

// [기능 2] 실시간 운행상태 조회 API (공공데이터 파라미터 무결성 패치 완료)
app.get('/api/realtime-status', async (req, res) => {
    const elevatorNo = req.query.elevatorNo; 
    if (!elevatorNo) return res.status(400).json({ status: "번호없음" });

    const safeElevatorNo = String(elevatorNo).trim().padStart(7, '0');
    
    // 1. 인메모리 캐시 히트(Hit) 체크
    const cachedStatus = statusCache.get(safeElevatorNo);
    if (cachedStatus) {
        return res.json({ status: cachedStatus }); 
    }

    try {
        // 💡 [정정] 정부 승강기 표준 명세서의 공식 파라미터명인 'elevatorNo'로 정밀 수정 수행
        const apiUrl = `https://apis.data.go.kr/B553664/ElevatorInformationService/getElevatorViewM?serviceKey=${PUBLIC_API_KEY}&elevatorNo=${safeElevatorNo}&_type=json`;
        
        const response = await axios.get(apiUrl, { timeout: 3000 });

        if (typeof response.data === 'string' && response.data.includes('<errMsg>')) {
            console.error(`[API 인증키 오류 발각] 승강기 고유번호: ${safeElevatorNo}`);
            return res.json({ status: "API키오류" }); 
        }

        const items = response.data?.response?.body?.items?.item || response.data?.response?.body?.item;
        let currentStatus = "상태알수없음";

        if (items) {
             const itemData = Array.isArray(items) ? items[0] : items;
             currentStatus = itemData.elvtrStts || itemData.elvtrSttsNm || "상태알수없음"; 
        }

        // 3. 정상 수집된 상태 데이터를 10분간 캐싱 디렉토리에 적재
        statusCache.set(safeElevatorNo, currentStatus);
        res.json({ status: currentStatus });

    } catch (error) {
        console.error(`❌ 공공 API 게이트웨이 통신 실패 (호기번호: ${safeElevatorNo}) - ${error.message}`);
        res.json({ status: "확인불가" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

app.listen(3000, () => {
    console.log("🚀 백엔드 엔진이 [자치구 주소 보존 + 공식 파라미터 패치 + 1500대 광역 로드] 모드로 안정 가동 중입니다!");
});

module.exports = app;
