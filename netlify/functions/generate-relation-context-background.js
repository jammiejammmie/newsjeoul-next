// generate-relation-context-background.js — topic_relations/topic_entities의 explanation(왜 연결되는지)을
// 자동 생성한다. PM 지시(2026-07-12, "관계 설명 데이터 생성" — 탐험 경험의 핵심 데이터 갭 해소).
//
// 대상: editorial_status='published' Topic부터 우선 백필한다. 이미 explanation이 있는 행은
// 쿼리 자체에서 제외해 절대 덮어쓰지 않는다. 관계가 약하거나 근거가 부족하면 LLM이 explanation을
// null로 반환하도록 지시하고, null/빈 문자열이면 그 행은 그냥 건너뛴다(억지로 채우지 않음).
// 근거 범위는 두 Topic의 name/summary(+draft.lead, 있으면)로 한정 — 원문 기사 재조회 없음.
//
// Background Function(15분 예산) — 장문 생성과 동일한 이유로 동기 함수의 26초 캡을 피한다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 5; // 발행 Topic 5개씩, 각 Topic당 관계+엔티티를 한 번의 LLM 호출로 묶어서 처리

async function supabaseGet(table, params) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + (params || ''), {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + (await res.text()));
  return res.json();
}

async function supabasePatch(table, params, data) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + params, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Supabase PATCH ' + table + ' 실패: ' + (await res.text()));
}

function topicContext(t) {
  var lead = (t.ai_context && t.ai_context.draft && t.ai_context.draft.lead) || t.summary || '(요약 없음)';
  return t.name + ' — ' + lead;
}

function buildRelationLine(topic, item, index) {
  var lines = [];
  lines.push('R' + index + ': "' + topic.name + '" ↔ "' + item.otherName + '"');
  lines.push('  - ' + topic.name + ': ' + topicContext(topic));
  lines.push('  - ' + item.otherName + ': ' + item.otherContext);
  return lines.join('\n');
}

function buildEntityLine(topic, item, index) {
  var lines = [];
  lines.push('E' + index + ': Topic "' + topic.name + '"와(과) 엔티티 "' + item.name + '"(' + item.type + ')');
  lines.push('  - Topic 맥락: ' + topicContext(topic));
  return lines.join('\n');
}

function buildOutputSchemaLine(items) {
  var parts = items.map(function (_, i) {
    return '{"index": ' + i + ', "explanation": "1~2문장 또는 null"}';
  });
  return parts.join(', ');
}

function buildPrompt(topic, relationItems, entityItems) {
  var relationLines = relationItems.map(function (item, i) { return buildRelationLine(topic, item, i); }).join('\n\n');
  var entityLines = entityItems.map(function (item, i) { return buildEntityLine(topic, item, i); }).join('\n\n');
  var relationSchema = buildOutputSchemaLine(relationItems);
  var entitySchema = buildOutputSchemaLine(entityItems);

  var prompt = '';
  prompt += '너는 뉴스저울의 에디토리얼 엔진이다. 아래 각 항목이 "왜 서로 관련있는지" 1~2문장으로 설명해라.\n\n';
  prompt += '규칙:\n';
  prompt += '- 주어진 맥락(Topic 요약/리드) 안에서만 판단해라. 맥락에 없는 사실을 추측하거나 지어내지 마라.\n';
  prompt += '- 관련성이 약하거나 왜 연결되는지 확신이 서지 않으면, 억지로 문장을 만들지 말고 explanation을 null로 반환해라.\n';
  prompt += '- 과장된 표현(예: "엄청난", "충격적인") 금지, 담백하게 사실 관계만 설명해라.\n';
  prompt += '- 인과관계("A 때문에 B", "A가 B로 이어졌다" 등)는 주어진 맥락에 명시적으로 나온 경우에만 서술해라.\n';
  prompt += '- 두 사건이 비슷한 시기에 일어났다는 이유만으로 인과관계로 확대 해석하지 마라 — 시간적\n';
  prompt += '  선후관계와 인과관계를 분명히 구분해라. 확실하지 않으면 인과 서술 없이 사실관계만 담백하게 써라.\n\n';
  prompt += '관계(Relation) 항목:\n' + (relationLines || '(없음)') + '\n\n';
  prompt += '엔티티(Entity) 항목:\n' + (entityLines || '(없음)') + '\n\n';
  prompt += '설명 없이 아래 JSON만 반환해라(코드블록 없이):\n';
  prompt += '{\n';
  prompt += '  "relations": [' + relationSchema + '],\n';
  prompt += '  "entities": [' + entitySchema + ']\n';
  prompt += '}';
  return prompt;
}

async function claudeGenerate(prompt) {
  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 4000 /* 2026-08-06: sonnet-5 adaptive thinking이 max_tokens를 함께 소진한다 — 잘림 여유 확보 */,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error('LLM API 오류: ' + (await res.text()));
  var data = await res.json();
  var text = data.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  var match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 형식을 찾을 수 없음: ' + text.slice(-200));
  return JSON.parse(match[0]);
}

async function gatherPendingItems(topic) {
  var results = await Promise.all([
    supabaseGet('topic_relations', '?source_topic_id=eq.' + topic.id + '&explanation=is.null&select=id,target_topic_id,topics!topic_relations_target_topic_id_fkey(id,name,summary,ai_context)'),
    supabaseGet('topic_relations', '?target_topic_id=eq.' + topic.id + '&explanation=is.null&select=id,source_topic_id,topics!topic_relations_source_topic_id_fkey(id,name,summary,ai_context)'),
    supabaseGet('topic_entities', '?topic_id=eq.' + topic.id + '&explanation=is.null&select=id,entities(name,type)'),
  ]);
  var relRowsA = results[0];
  var relRowsB = results[1];
  var entRows = results[2];

  var relationItems = [];
  relRowsA.forEach(function (r) {
    if (r.topics) relationItems.push({ id: r.id, otherName: r.topics.name, otherContext: topicContext(r.topics) });
  });
  relRowsB.forEach(function (r) {
    if (r.topics) relationItems.push({ id: r.id, otherName: r.topics.name, otherContext: topicContext(r.topics) });
  });

  var entityItems = [];
  entRows.forEach(function (e) {
    if (e.entities) entityItems.push({ id: e.id, name: e.entities.name, type: e.entities.type });
  });

  return { relationItems: relationItems, entityItems: entityItems };
}

async function applyResult(result, relationItems, entityItems, stats) {
  var relations = result.relations || [];
  for (var i = 0; i < relations.length; i++) {
    var r = relations[i];
    var item = relationItems[r.index];
    if (!item) continue;
    if (r.explanation && String(r.explanation).trim()) {
      await supabasePatch('topic_relations', '?id=eq.' + item.id, { explanation: r.explanation });
      stats.relationsFilled++;
    } else {
      stats.relationsSkippedWeak++;
    }
  }

  var entities = result.entities || [];
  for (var j = 0; j < entities.length; j++) {
    var e = entities[j];
    var item2 = entityItems[e.index];
    if (!item2) continue;
    if (e.explanation && String(e.explanation).trim()) {
      await supabasePatch('topic_entities', '?id=eq.' + item2.id, { explanation: e.explanation });
      stats.entitiesFilled++;
    } else {
      stats.entitiesSkippedWeak++;
    }
  }
}

exports.handler = async function (event) {
  var headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };

  // Netlify Scheduled Function은 httpMethod='POST'로 호출되지만 x-admin-key 헤더가 없다
  // (event.headers['x-nf-event']==='schedule'로 식별) — 2026-07-17 실운영 검증 중 발견,
  // 이 조건이 없으면 자동 스케줄 호출이 전부 401로 조용히 거부돼 파이프라인이 절대 자동으로 안 돈다.
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    var adminKey = (event.headers && event.headers['x-admin-key']) || (event.queryStringParameters && event.queryStringParameters.key);
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers: headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    var topics = await supabaseGet(
      'topics',
      '?editorial_status=eq.published&status=eq.active&select=id,name,summary,ai_context,updated_at&order=updated_at.desc&limit=' + BATCH_SIZE
    );

    var stats = {
      topicsProcessed: 0,
      relationsFilled: 0,
      relationsSkippedWeak: 0,
      entitiesFilled: 0,
      entitiesSkippedWeak: 0,
      failed: 0,
    };

    for (var t = 0; t < topics.length; t++) {
      var topic = topics[t];
      try {
        var pending = await gatherPendingItems(topic);
        if (pending.relationItems.length === 0 && pending.entityItems.length === 0) {
          stats.topicsProcessed++;
          continue;
        }
        var prompt = buildPrompt(topic, pending.relationItems, pending.entityItems);
        var result = await claudeGenerate(prompt);
        await applyResult(result, pending.relationItems, pending.entityItems, stats);
        stats.topicsProcessed++;
      } catch (e) {
        stats.failed++;
        console.error('generate-relation-context topic 처리 오류:', topic.id, e.message);
      }
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify(Object.assign({ ok: true, targetedThisRun: topics.length }, stats)),
    };
  } catch (e) {
    console.error('generate-relation-context 에러:', e.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: e.message }) };
  }
};
