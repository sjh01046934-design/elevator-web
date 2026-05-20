const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// 1. 데이터베이스 연결 설정 (Supabase 클라우드 데이터베이스)
const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

// 2. 승강기 검색 API 만들기
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) {
        return res.status(400).send("검색어를 입력해주세요.");
    }

    try {
        // [핵심 로직] 검색어의 모든 띄어쓰기를 없앱니다. (예: "보듬3로 92" -> "보듬3로92")
        const queryNoSpace = keyword.replace(/\s+/g, '');
        
        // [핵심 로직] DB에 저장된 주소와 건물명도 띄어쓰기를 싹 없앤 후 비교합니다. 
        // 띄어쓰기가 달라서 검색이 안 되는 고질적인 실무 문제를 완벽히 해결합니다.
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE REPLACE(A.건물명, ' ', '') LIKE $1 
               OR REPLACE(A.건물주소, ' ', '') LIKE $1
            ORDER BY A.건물주소 ASC
            LIMIT 1000
        `;
        
        const result = await pool.query(sql, [`%${queryNoSpace}%`]);
        res.json(result.rows);
    } catch (error) {
        console.error("DB 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

// 3. 사용자의 바탕화면에 있는 index1.html 파일을 읽어서 브라우저에 전달
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

// 4. 통신 서버 켜기 
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 승강기 API 서버 가동 중 (포트: ${port}, 데이터 한도: 1000건)`);
});

module.exports = app;
