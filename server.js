const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); // 외부 웹/앱에서 접속 허용

// 1. 데이터베이스 연결 설정 (Supabase 클라우드 데이터베이스)
const pool = new Pool({
    // Supabase의 Pooler 연결 주소를 사용합니다.
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: {
        rejectUnauthorized: false // 외부 클라우드 접속을 위한 SSL 설정
    }
});

// 2. 승강기 검색 API 만들기 (건물명으로 검색)
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) {
        return res.status(400).send("검색할 건물명을 입력해주세요.");
    }

    try {
        // [핵심 수정] JOIN을 사용해 승강기 정보와 좌표를 한 번에 가져옵니다.
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE A.건물명 LIKE $1
            LIMIT 50
        `;
        const result = await pool.query(sql, [`%${keyword}%`]);
        
        // 검색 결과를 웹브라우저/스마트폰으로 발송
        res.json(result.rows);
    } catch (error) {
        console.error("DB 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

// 3. 사용자의 바탕화면에 있는 index1.html 파일을 읽어서 브라우저에 안전하게 배달합니다.
app.get('/', (req, res) => {
    // 서버와 같은 폴더에 있는 index1.html을 바로 브라우저에 배달합니다.
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

// 4. 통신 서버 켜기 (3000번 포트)
app.listen(3000, () => {
    console.log("🚀 승강기 API 서버가 클라우드 DB(Supabase) 모드로 3000번 포트에서 가동을 시작했습니다!");
});

// [Vercel 배포용 필수 코드] 클라우드 환경에서 이 앱을 실행할 수 있도록 내보냅니다.
module.exports = app;