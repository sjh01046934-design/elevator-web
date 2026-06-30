const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); 
const NodeCache = require('node-cache');

const app = express();
app.use(cors()); 

const PUBLIC_API_KEY = 'bf828022bb4535034959395893c59397fff91ac219c93670610575093972289d';
const statusCache = new NodeCache({ stdTTL: 600 });

// 💡 [수정 1] Supabase DB 접속 문자열 원상복구 (비밀번호 및 호스트명 포함)
const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

// [기능 1] 주소 및 상호명 컨텍스트 기반 Supabase 데이터 추출 엔드포인트
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    const roadAddress = req.query.roadAddress;
    const jibunAddress = req.query.jibunAddress;
    
    try {
        let result;
        let conditions = [];
        let queryParams = [];
        let paramIdx = 1;

        // 주소 데이터가 존재할 경우 핵심 키워드 파싱 매칭
        let targetAddr = roadAddress || jibunAddress;
        if (targetAddr) {
            let cleanAddr = targetAddr.replace(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(특별자치시|특별시|광역시|도|특별자치도)?\s*/, '');
            let words = cleanAddr.trim().split(/\s+/);
            
            // 도로명/동이름 토큰과 건물번호 토큰 분리
            let textTokens = words.filter(w => !/\d/.test(w));
            let numTokens = words.filter(w => /\d/.test(w));

            textTokens.forEach(token => {
                if (token.length > 1) {
                    // 💡 [컬럼명 반영] A.건물명 -> A.buld_nm 변경 및 building_address 검색 조건 확장
                    conditions.push(`(A.building_address LIKE $${paramIdx} OR A.address1 LIKE $${paramIdx} OR A.address2 LIKE $${paramIdx} OR A.buld_nm LIKE $${paramIdx})`);
                    queryParams.push(`%${token}%`);
                    paramIdx++;
                }
            });

            numTokens.forEach(token => {
                let match = token.match(/\d+/);
                if (match) {
                    conditions.push(`(A.building_address LIKE $${paramIdx} OR A.address1 LIKE $${paramIdx} OR A.address2 LIKE $${paramIdx})`);
                    queryParams.push(`%${match[0]}%`);
                    paramIdx++;
                }
            });
        }

        if (conditions.length > 0) {
            const sql = `
                SELECT A.*, B.위도, B.경도 
                FROM elevators_raw A 
                LEFT JOIN coords_raw B ON A.buld_nm = B.건물명 
                WHERE ${conditions.join(' AND ')}
                LIMIT 1500
            `;
            result = await pool.query(sql, queryParams);
        } else {
            // 주소 파싱 실패 시 상호명 유사도 매칭 백업
            const sql = `
                SELECT A.*, B.위도, B.경도 
                FROM elevators_raw A 
                LEFT JOIN coords_raw B ON A.buld_nm = B.건물명 
                WHERE A.buld_nm LIKE $1
                LIMIT 1500
            `;
            result = await pool.query(sql, [`%${keyword}%`]);
        }
        
        res.json(result.rows);
    } catch (error) {
        console.error("Supabase SQL 조회 실패:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

// [기능 2] 오직 단일 호기의 실시간 운행상태값만 정부 API에서 핀포인트 수집
app.get('/api/realtime-status', async (req, res) => {
    const elevatorNo = req.query.elevatorNo; 
    if (!elevatorNo) return res.status(400).json({ status: "번호없음" });

    const safeElevatorNo = String(elevatorNo).trim().padStart(7, '0');
    const cachedStatus = statusCache.get(safeElevatorNo);
    if (cachedStatus) return res.json({ status: cachedStatus }); 

    try {
        // 🚨 [필수 수정] elevatorNo -> elevator_no로 변경
        const apiUrl = `https://apis.data.go.kr/B553664/ElevatorInformationService/getElevatorViewM?serviceKey=${PUBLIC_API_KEY}&elevator_no=${safeElevatorNo}&_type=json`;
        const response = await axios.get(apiUrl, { timeout: 5000 });

        // 💡 [디버깅] 실제 응답 내용을 로그로 찍어보세요 (백엔드 터미널 확인)
        // console.log("공공데이터 응답:", response.data);

        if (response.data?.response?.body?.items?.item) {
            const item = Array.isArray(response.data.response.body.items.item) ? response.data.response.body.items.item[0] : response.data.response.body.items.item;
            // 🚨 [필수 수정] elvtrSttsNm -> elvtrStts로 변경
            const status = item.elvtrStts || "상태알수없음";
            statusCache.set(safeElevatorNo, status);
            return res.json({ status: status });
        }
        res.json({ status: "데이터없음" });
    } catch (error) {
        console.error("API 통신 에러:", error.message);
        res.json({ status: "통신에러" });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index1.html')); });
app.listen(3000, () => { console.log("🚀 백엔드 주소 매칭 및 제원 분석 엔진 가동!"); });
module.exports = app;
