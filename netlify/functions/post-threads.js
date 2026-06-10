// Threads 자동 포스팅 - 오늘의 침묵지수 TOP1
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;

async function fetchTodayNews() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_kr?created_at=gte.${todayStart.toISOString()}&select=*&order=created_at.desc&limit=10`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      }
    }
  );
  if (!res.ok) throw new Error('Supabase 조회 실패: ' + await res.text());
  return await res.json();
}

function buildPost(item, silenceScore) {
  const direction = item.bias_score > 50 ? '보수 쏠림' : '진보 쏠림';
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

  return `📊 ${today} 침묵지수 1위

"${item.title}"

🔴 ${item.conservative_outlet}
${item.conservative_headline}

🔵 ${item.liberal_outlet}
${item.liberal_headline}

침묵지수 ${silenceScore}점 (${direction}) · ${item.category}

두 시각 모두 보기 → https://newsjeoul.co.kr

#뉴스저울 #미디어편향 #한국뉴스 #오늘의뉴스`;
}

async function createThreadsContainer(text) {
  const params = new URLSearchParams({
    media_type: 'TEXT',
    text,
    access_token: THREADS_ACCESS_TOKEN,
  });

  const res = await fetch(
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`,
    { method: 'POST', body: params }
  );
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('컨테이너 생성 실패: ' + JSON.stringify(data));
  return data.id;
}

async function publishThreadsPost(containerId) {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: THREADS_ACCESS_TOKEN,
  });

  const res = await fetch(
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`,
    { method: 'POST', body: params }
  );
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('게시 실패: ' + JSON.stringify(data));
  return data.id;
}

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod) {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'THREADS_USER_ID 또는 THREADS_ACCESS_TOKEN 환경변수 없음' }) };
  }

  try {
    const news = await fetchTodayNews();
    if (!news.length) throw new Error('오늘 뉴스 없음');

    // 침묵지수 = |bias_score - 50| 이 클수록 한쪽이 침묵
    const top = news
      .map(item => ({ ...item, silenceScore: Math.abs((item.bias_score || 50) - 50) }))
      .sort((a, b) => b.silenceScore - a.silenceScore)[0];

    const text = buildPost(top, top.silenceScore);
    console.log('포스팅 내용:\n', text);

    const containerId = await createThreadsContainer(text);
    // Threads API 권장: 컨테이너 생성 후 최소 30초 대기
    await new Promise(r => setTimeout(r, 30000));
    const postId = await publishThreadsPost(containerId);

    console.log('Threads 게시 완료:', postId);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, postId, title: top.title, silenceScore: top.silenceScore })
    };
  } catch(e) {
    console.error(e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
