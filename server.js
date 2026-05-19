const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) {
        return res.status(400).send("검색어를 입력해주세요.");
    }

    try {
        // [변경점] LIMIT를 1000으로 대폭 상향하여 누락 방지!
        // [변경점] 좌표를 B(coords_raw)에서 가져오되, 없으면 NULL 처리하여 프론트에서 카카오로 찾게 유도
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE A.건물명 LIKE $1 
               OR A.건물주소 LIKE $1
            ORDER BY A.건물주소 ASC
            LIMIT 1000
        `;
        const result = await pool.query(sql, [`%${keyword}%`]);
        
        res.json(result.rows);
    } catch (error) {
        console.error("DB 검색 에러:", error);
        res.status(500).send("서버 에러가 발생했습니다.");
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 승강기 API 서버 가동 중 (포트: ${port}, 데이터 한도: 1000건)`);
});

module.exports = app;
