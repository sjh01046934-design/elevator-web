const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); // 외부 웹/앱에서 접속 허용
app.use(express.static(__dirname)); // HTML 파일 제공

// 1. 데이터베이스 연결 설정 (Supabase 클라우드 데이터베이스)
const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

// 2. 승강기 검색 API 만들기 (건물명 + 건물주소 통합 검색)
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) {
        return res.status(400).send("검색어를 입력해주세요.");
    }

    try {
        // [핵심 변경] A.건물명 뿐만 아니라 A.건물주소 컬럼도 동시에 검색합니다!
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE A.건물명 LIKE $1 
               OR A.건물주소 LIKE $1
            LIMIT 50
        `;
        const result = await pool.query(sql, [`%${keyword}%`]);
        
        res.json(result.rows);
    } catch (error) {
        console.error("DB 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

// 3. 메인 HTML 응답
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

// 4. 통신 서버 켜기
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 승강기 API 서버가 ${port}번 포트에서 가동을 시작했습니다!`);
});

module.exports = app;
