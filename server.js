const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
// [중요] JSON 데이터를 서버에서 받기 위해 필요합니다.
app.use(express.json()); 
app.use(cors());
app.use(express.static(__dirname));

const pool = new Pool({
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
});

// 1. 기존 승강기 검색 API
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    const sido = req.query.sido || '';
    
    if (!keyword) {
        return res.status(400).send("검색어를 입력해주세요.");
    }

    try {
        const queryNoSpace = keyword.replace(/\s+/g, '');
        const sidoNoSpace = sido === '전국' ? '' : sido.replace(/\s+/g, '');
        
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

// 2. [추가] 좌표 자동 보정 API (프론트에서 좌표가 틀리면 이걸 호출합니다)
app.post('/api/update-coords', async (req, res) => {
    const { buildingName, lat, lng } = req.body;
    if (!buildingName || !lat || !lng) return res.status(400).send("데이터 부족");

    try {
        const sql = `
            INSERT INTO coords_raw (건물명, 위도, 경도)
            VALUES ($1, $2, $3)
            ON CONFLICT (건물명) 
            DO UPDATE SET 위도 = $2, 경도 = $3;
        `;
        await pool.query(sql, [buildingName, lat, lng]);
        res.status(200).send("좌표 업데이트 성공");
    } catch (error) {
        console.error("좌표 저장 에러:", error);
        res.status(500).send("저장 실패");
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index1.html')); 
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 API 서버 가동 중 (포트: ${port}) - 자가 치유형 좌표 시스템 적용`);
});

module.exports = app;
