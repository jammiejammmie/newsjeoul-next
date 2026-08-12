import type { NextConfig } from "next";
// 상대경로로 가져온다 — next.config는 앱 빌드 그래프 밖이라 '@/' 별칭이 적용되지 않는다.
import { DOC_SLUG_RENAMES } from "./lib/hubs/doc-slug-renames";

const nextConfig: NextConfig = {
  /**
   * 문서 slug 교체에 따른 구 URL 처리(2026-08-12).
   *
   * 왜 페이지 안이 아니라 여기인가: 문서 페이지에서 처리하면 "문서를 못 찾았다"를 확인하기
   * 위해 매번 Supabase를 다녀와야 리다이렉트를 판단할 수 있다. 여기서 걸면 요청이 앱에
   * 닿기 전에 넘어간다 — 옛 URL은 이미 색인되어 계속 유입되는 주소이므로 그 비용이 반복된다.
   *
   * permanent: true는 308을 낸다(Next.js 기본). 검색엔진은 301과 308을 같은 "영구 이동"으로
   * 처리하므로 색인 이전에 차이가 없다.
   */
  async redirects() {
    return DOC_SLUG_RENAMES.map((r) => ({
      source: `/hub/${r.hub}/${r.from}`,
      destination: `/hub/${r.hub}/${r.to}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
