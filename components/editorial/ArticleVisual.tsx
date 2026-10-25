import Image from 'next/image'
import { editorialVisual } from '@/lib/hubs/editorial/visuals'
import './visuals.css'
export default function ArticleVisual({path}:{path:string}) {
 const visual=editorialVisual(path)
 if(!visual) return null
 return <figure className="article-visual"><Image src={visual.src} alt={visual.alt} width={1200} height={800} unoptimized loading="eager" /><figcaption>{visual.caption}</figcaption></figure>
}
const aids: Record<string,{title:string;items:[string,string][];note:string}> = {
 '/hub/lg-gram-2026/ram-ssd-1sey4q':{title:'같은 메모리처럼 보여도, 구매 판단은 다릅니다',items:[['RAM 16GB','16Z95U-GS5WK의 온보드 메모리. 구매 전에 필요한 용량을 결정하세요.'],['SSD 512GB','같은 모델은 추가 슬롯 1개. 저장공간 확장과 RAM 증설을 구분하세요.']],note:'해당 모델 기준이며 그램 전체에 적용되는 사양은 아닙니다. 아래 공식 출처와 모델 코드를 확인하세요.'},
 '/hub/robot-vacuum-2026/troubleshoot-vtxdcs':{title:'8.8cm를 한 번에 넘는 벽으로 읽으면 안 됩니다',items:[['① 첫 높이 ≤ 4.5cm','단차의 첫 번째 높이 조건'],['② 중간 깊이 > 12cm, ≤ 14cm','두 높이 사이 발판의 깊이 조건'],['③ 두 번째 높이 ≤ 4.3cm','제조사 안내의 2단 문턱 조건']],note:'제품의 실험 조건을 정리한 설명입니다. 재질·형태·환경에 따라 실제 통과 여부는 달라집니다.'},
 '/hub/galaxy-z-fold8/tablet-replacement-reading-pdf':{title:'책과 PDF는 화면을 쓰는 방식이 다릅니다',items:[['전자책 · 글자 재배치','글자 크기를 키우면 줄바꿈이 바뀌는 콘텐츠'],['고정형 PDF · 원래 지면 유지','확대하면 페이지 일부를 이동하며 읽어야 하는 콘텐츠']],note:'파일·앱에 따라 동작이 다릅니다. 평소 읽는 문서의 작은 글씨와 표를 실제 화면에서 확인하세요.'},
 '/hub/galaxy-buds4/pc-connect-mic':{title:'연결과 마이크 선택은 별개의 단계입니다',items:[['01 · 이어폰 페어링','이어폰을 페어링 상태로 전환'],['02 · Windows Bluetooth','기기 추가에서 이어폰 선택'],['03 · 통화 앱 입력·출력','회의 앱의 스피커와 마이크를 각각 확인']],note:'Bluetooth 연결만으로 모든 앱의 마이크가 자동 선택되는 것은 아닙니다. 구체적인 버튼 조작은 본문을 확인하세요.'},
}
export function ArticleDecisionVisual({path}:{path:string}) {
 const aid=aids[path];if(!aid)return null
 return <aside className="decision-visual" aria-label={aid.title}><h3>{aid.title}</h3><div className="decision-steps">{aid.items.map(([title,body])=><div key={title}><strong>{title}</strong><p>{body}</p></div>)}</div><p className="decision-note">{aid.note}</p></aside>
}
