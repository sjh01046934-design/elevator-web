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
    const sido = req.query.sido || '';
    
    if (!keyword) {
        return res.status(400).send("검색어를 입력해주세요.");
    }

    try {
        const queryNoSpace = keyword.replace(/\s+/g, '');
        const sidoNoSpace = sido === '전국' ? '' : sido.replace(/\s+/g, '');
        
        // [핵심 변경] COALESCE를 사용하여 DB에 좌표가 있으면 쓰고, 없으면 세종시청 기본좌표(36.48008, 127.28921)를 리턴합니다.
        // 이렇게 하면 프론트엔드에서 카카오 API를 호출할 필요가 없어집니다!
        let sql = `
            SELECT A.*, 
                   COALESCE(B.위도, 36.48008) as 위도, 
                   COALESCE(B.경도, 127.28921) as 경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE (REPLACE(A.건물명, ' ', '') LIKE $1 OR REPLACE(A.건물주소, ' ', '') LIKE $1)
        `;
        let params = [`%${queryNoSpace}%`];

        if (sidoNoSpace) {
            sql += ` AND REPLACE(A.건물주소, ' ', '') LIKE $2 `;
            params.push(`${sidoNoSpace}%`);
        }
        
        sql += ` ORDER BY A.건물주소 ASC LIMIT 1000`;
        
        const result = await pool.query(sql, params);
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
    console.log(`🚀 API 서버 가동 중 (포트: ${port}) - 초고속 DB 좌표 적용`);
});

module.exports = app;
