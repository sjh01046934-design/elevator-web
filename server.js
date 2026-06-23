const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); // 공공데이터 API와 통신하기 위한 패키지

const app = express();
app.use(cors()); // 외부 웹/앱에서 접속 허용

// [필수 입력] 공공데이터포털 발급 인증키 (인코딩/디코딩 중 작동하는 키 사용)
// ★ 주의: 이전에 쓰시던 본인의 실제 API 키로 반드시 바꿔 넣어주세요!
const PUBLIC_API_KEY = '여기에_발급받으신_인증키를_붙여넣으세요';

// 1. 데이터베이스 연결 설정 (Supabase 클라우드 데이터베이스)
const pool = new Pool({
    // Supabase의 Pooler 연결 주소를 사용합니다.
    connectionString: "postgresql://postgres.oiazhplvilthpanwceob:p2XEnK5UMVDjmk25@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
    ssl: {
        rejectUnauthorized: false // 외부 클라우드 접속을 위한 SSL 설정
    }
});

// 2. 승강기 검색 API 만들기 (건물명으로 검색 + 실시간 상태 융합)
app.get('/api/elevators', async (req, res) => {
    const keyword = req.query.keyword;
    
    if (!keyword) {
        return res.status(400).send("검색할 건물명을 입력해주세요.");
    }

    try {
        // [1단계] Supabase DB에서 승강기 기본 정보와 좌표를 가져옵니다.
        const sql = `
            SELECT A.*, B.위도, B.경도 
            FROM elevators_raw A
            LEFT JOIN coords_raw B ON A.건물명 = B.건물명
            WHERE A.건물명 LIKE $1
            LIMIT 50
        `;
        const result = await pool.query(sql, [`%${keyword}%`]);
        const elevators = result.rows;

        // [2단계] DB에서 찾은 각 승강기 번호로 공공데이터 API에 실시간 상태 조회
        const elevatorsWithStatus = await Promise.all(elevators.map(async (elevator) => {
            
            // [핵심 해결] DB 컬럼명이 무엇이든 확실하게 잡아내도록 다중 조건 적용
            const elevatorNo = elevator.승강기고유번호 || elevator.elevatorNo || elevator.elevator_no || elevator.승강기번호;

            if (!elevatorNo) {
                return { ...elevator, 실시간운행상태: "번호없음" };
            }

            try {
                // 공공데이터 통신 URL
                const apiUrl = `http://apis.data.go.kr/openapi/service/ElevatorInformationService/getElevatorView?serviceKey=${PUBLIC_API_KEY}&elevator_no=${elevatorNo}&_type=json`;
                
                const response = await axios.get(apiUrl);

                // API 응답 구조에서 상태값(elvtrSttsNm) 빼오기 
                const items = response.data?.response?.body?.items?.item;
                let currentStatus = "상태알수없음";

                if (items) {
                     // 검색 결과가 여러 개일 경우를 대비해 첫 번째 항목 추출
                     const itemData = Array.isArray(items) ? items[0] : items;
                     currentStatus = itemData.elvtrSttsNm || "상태알수없음"; // 예: '운행중', '합격상실' 등
                }

                // 기존 DB 정보(elevator)에 '실시간운행상태' 항목을 새롭게 추가
                return { ...elevator, 실시간운행상태: currentStatus };

            } catch (apiError) {
                console.error(`API 호출 실패 (승강기번호: ${elevatorNo}):`, apiError.message);
                // 통신 실패 시 에러를 내지 않고 '확인불가' 상태로 지도에 정상 표시되게 처리
                return { ...elevator, 실시간운행상태: "확인불가" };
