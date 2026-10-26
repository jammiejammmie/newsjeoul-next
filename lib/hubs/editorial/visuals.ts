export type EditorialVisual = { src: string; alt: string; caption: string }
const visuals: Record<string, EditorialVisual> = {
 gram: {src:'/images/editorial/gram.webp',alt:'책상 위 흰색 경량 노트북과 충전기를 그린 재현 일러스트',caption:'LG 그램의 외형을 참고한 AI 제작 설명용 재현 이미지. 실제 모델·포트·액세서리 구성과 다를 수 있습니다.'},
 robot: {src:'/images/editorial/robot.webp',alt:'문턱이 있는 거실에 놓인 로봇청소기와 도크의 재현 일러스트',caption:'로보락 외형을 참고한 AI 제작 설명용 재현 이미지. 문턱 통과 시험이나 실제 설치 사진이 아닙니다.'},
 buds: {src:'/images/editorial/buds.webp',alt:'이어버드 한 개가 든 케이스와 밖에 놓인 다른 이어버드를 그린 일러스트',caption:'AI 제작 이어폰 개념 일러스트. 특정 버즈 모델의 정확한 형상·구성품을 보여 주는 제품 사진은 아닙니다.'},
 fold: {src:'/images/editorial/fold.webp',alt:'펼친 폴더블폰, 태블릿, 접은 플립형 기기를 비교한 개념 일러스트',caption:'AI 제작 폼팩터 개념 일러스트. 실제 제품·화면·크기 비율과 다를 수 있습니다.'},
}
export const VISUAL_ROUTES: Record<string,string> = {
 '/hub/lg-gram-2026/ram-ssd-1sey4q':'gram',
 '/hub/lg-gram-2026/freedos-vs-windows-total-cost':'gram',
 '/hub/robot-vacuum-2026/troubleshoot-vtxdcs':'robot',
 '/hub/galaxy-z-fold8/fold8-vs-ultra-reading-camera':'fold',
 '/hub/galaxy-z-fold8/tablet-replacement-reading-pdf':'fold',
 '/hub/galaxy-z-flip8/flip8-vs-fold8':'fold',
 '/hub/galaxy-buds4/pc-connect-mic':'buds',
 '/hub/galaxy-buds4/case-not-charging':'buds',
 '/hub/galaxy-buds4/buds4-vs-buds4-pro':'buds',
 '/hub/galaxy-buds4/with-iphone':'buds',
}
export function editorialVisual(path: string): EditorialVisual | undefined { return visuals[VISUAL_ROUTES[path]] }
